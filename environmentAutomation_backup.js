const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { Client, GatewayIntentBits } = require('discord.js');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const http = require('http');

class EnvironmentAutomation {
    constructor() {
        // No browser needed anymore
    }

    // Create Google Drive folder using API
    async createGoogleDriveFolder(folderName, parentFolderId = null) {
        try {
            // Load service account credentials
            const serviceAccountKeyPath = path.join(__dirname, 'service-account-key.json');
            const auth = new google.auth.GoogleAuth({
                keyFile: serviceAccountKeyPath,
                scopes: [
                    'https://www.googleapis.com/auth/drive',
                    'https://www.googleapis.com/auth/drive.file'
                ]
            });

            const drive = google.drive({ version: 'v3', auth });

            // Create folder metadata
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            };

            // Add parent folder if specified
            if (parentFolderId) {
                folderMetadata.parents = [parentFolderId];
            }

            // Create the folder
            const folder = await drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });

            console.log(`Folder created with ID: ${folder.data.id}`);
            return folder.data.id;

        } catch (error) {
            console.error('Error creating folder via API:', error);
            throw error;
        }
    }

    // Create Google Sheet using API
    async createGoogleSheet(sheetName, folderId) {
        try {
            // Load service account credentials
            const serviceAccountKeyPath = path.join(__dirname, 'service-account-key.json');
            const auth = new google.auth.GoogleAuth({
                keyFile: serviceAccountKeyPath,
                scopes: [
                    'https://www.googleapis.com/auth/drive',
                    'https://www.googleapis.com/auth/drive.file',
                    'https://www.googleapis.com/auth/spreadsheets'
                ]
            });

            const drive = google.drive({ version: 'v3', auth });
            const sheets = google.sheets({ version: 'v4', auth });

            // Create spreadsheet metadata
            const spreadsheetMetadata = {
                name: sheetName,
                mimeType: 'application/vnd.google-apps.spreadsheet',
                parents: [folderId]
            };

            // Create the spreadsheet
            const spreadsheet = await drive.files.create({
                resource: spreadsheetMetadata,
                fields: 'id'
            });

            const spreadsheetId = spreadsheet.data.id;
            console.log(`Spreadsheet created with ID: ${spreadsheetId}`);

            // Initialize the spreadsheet with headers if it's for tweets
            if (sheetName.includes('Tweets') && !sheetName.includes('Follow Report')) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetId,
                    range: 'A1:E1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Date', 'Username', 'Tweet', 'URL', 'Followers']]
                    }
                });
            } else if (sheetName.includes('Follow Report')) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetId,
                    range: 'A1:F1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Date', 'Username', 'Profile URL', 'Followers', 'Following', 'Status']]
                    }
                });
            }

            return spreadsheetId;

        } catch (error) {
            console.error('Error creating sheet via API:', error);
            throw error;
        }
    }

    // Update config.json with new environment
    updateConfig(envData) {
        const configPath = path.join(__dirname, 'config.json');
        
        try {
            let config = {};
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
            
            // Add new environment to config
            config[envData.envKey] = {
                name: envData.envName,
                searchQuery: envData.searchQuery,
                userSearchQuery: envData.envKey,
                sheetPrefix: `${envData.envName} Tweets`,
                followersThreshold: envData.followersThreshold,
                followAccountsThreshold: envData.followAccountsThreshold,
                statusMessages: {
                    following: `Following ${envData.envName} accounts, please wait...`,
                    monitoring: `📊 Monitors latest '${envData.envName} Tweets' spreadsheet for new rows`
                },
                followSheet: `${envData.envName} Follow Report`,
                targetSheet: 'Relevant Tweets',
                folder: envData.folderId
            };
            
            // Write updated config
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            return true;
        } catch (error) {
            console.error('Error updating config:', error);
            throw error;
        }
    }

    // Main automation function
    async createEnvironment(envData) {
        try {
            console.log('🚀 Starting environment creation process...');
            console.log('📋 Process: API folder creation → Profile selection → Manual sheet creation');
            
            // Step 1: Create Google Drive folder using API in authorized parent folder
            console.log('📁 Step 1: Creating Google Drive folder via API...');
            const authorizedParentFolderId = '10xvEyem4vrIIGosiTMbqijEgvslKxH4i';
            const folderId = await this.createGoogleDriveFolder(envData.envName, authorizedParentFolderId);
            if (!folderId) {
                throw new Error('Failed to create Google Drive folder');
            }
            console.log(`✅ Folder created successfully: ${folderId}`);
            
            // Step 2: Skip Chrome automation - provide manual instructions instead
            console.log('✅ Step 2: Folder creation completed - manual setup required');
            const chromeResult = { success: true, message: 'Folder created successfully. Manual setup required.' };
            
            // Step 3: Update config.json (do this while user works on sheets)
            console.log('⚙️ Step 3: Updating configuration...');
            envData.folderId = folderId;
            this.updateConfig(envData);
            
            // Step 4: Create Discord channel (if possible)
            console.log('💬 Step 4: Attempting Discord channel creation...');
            let discordResult = null;
            try {
                discordResult = await this.createDiscordChannel(envData.discordChannelName);
            } catch (error) {
                console.log('Discord channel creation failed, will need manual setup:', error.message);
                discordResult = { success: false, message: 'Manual Discord setup required' };
            }
            
            // Step 5: Create IFTTT applets
            console.log('🔗 Step 5: Generating IFTTT applet instructions...');
            let appletResult = null;
            try {
                appletResult = await this.createIFTTTApplets(envData);
            } catch (error) {
                console.log('IFTTT applet creation failed, manual setup required:', error.message);
                appletResult = { success: false, message: 'Manual IFTTT setup required' };
            }
            
            console.log('');
            console.log('🎉 Environment creation process completed!');
            console.log('');
            console.log('📁 GOOGLE DRIVE FOLDER CREATED SUCCESSFULLY!');
            console.log(`🔗 Folder ID: ${folderId}`);
            console.log(`🌐 Folder URL: https://drive.google.com/drive/folders/${folderId}`);
            console.log('');
            console.log('📋 MANUAL CHECKLIST - Complete these steps:');
            console.log('');
            console.log('📂 GOOGLE DRIVE:');
            console.log(`   🔗 Open folder: https://drive.google.com/drive/folders/${folderId}`);
            console.log('');
            console.log('📊 GOOGLE SHEETS:');
            console.log('   1. Create "Relevant Tweets" sheet');
            console.log(`   2. Create "${envData.envName} Follow Report" sheet`);
            console.log('');
            console.log('💬 DISCORD:');
            console.log(`   3. Create channel "${envData.discordChannelName}" in Discord server`);
            console.log('');
            console.log('🔗 IFTTT:');
            console.log(`   4. Create "New ${envData.envName} Tweets" applet in IFTTT`);
            console.log(`   5. Create "Relevant ${envData.envName} Tweets" applet in IFTTT`);
            console.log('');
            
            return {
                success: true,
                folderId: folderId,
                folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
                envName: envData.envName,
                discordChannelName: envData.discordChannelName,
                sheets: null, // Manual creation required
                sheetsCreated: false,
                chromeOpened: false, // No Chrome automation
                discord: discordResult,
                applets: appletResult,
                manualStepsRequired: true,
                manualChecklist: {
                    driveFolder: {
                        completed: true,
                        url: `https://drive.google.com/drive/folders/${folderId}`,
                        description: 'Google Drive folder created'
                    },
                    sheets: {
                        completed: false,
                        items: [
                            'Create "Relevant Tweets" sheet',
                            `Create "${envData.envName} Follow Report" sheet`
                        ]
                    },
                    discord: {
                        completed: false,
                        items: [
                            `Create channel "${envData.discordChannelName}" in Discord server`
                        ]
                    },
                    ifttt: {
                        completed: false,
                        items: [
                            `Create "New ${envData.envName} Tweets" applet in IFTTT`,
                            `Create "Relevant ${envData.envName} Tweets" applet in IFTTT`
                        ]
                    }
                },
                message: 'Environment setup completed. Google Drive folder created successfully - please complete the manual checklist.'
            };
            
        } catch (error) {
            console.error('Environment creation failed:', error);
            throw error;
        }
    }

    // Discord channel creation using Discord API
    async createDiscordChannel(channelName) {
        try {
            // Check if Discord bot token exists
            const discordToken = process.env.DISCORD_BOT_TOKEN;
            if (!discordToken) {
                console.log('No Discord bot token found. Manual setup required.');
                return { 
                    success: false, 
                    message: `No Discord bot token configured. Please create channel "${channelName}" manually.`,
                    channelName: channelName
                };
            }

            // Get Guild ID from environment
            const guildId = process.env.DISCORD_GUILD_ID;
            if (!guildId) {
                console.log('No Discord guild ID found. Manual setup required.');
                return { 
                    success: false, 
                    message: `No Discord server configured. Please create channel "${channelName}" manually.`,
                    channelName: channelName
                };
            }

            // Create Discord client
            const client = new Client({
                intents: [GatewayIntentBits.Guilds]
            });

            return new Promise((resolve) => {
                client.once('ready', async () => {
                    try {
                        const guild = await client.guilds.fetch(guildId);
                        
                        // Create text channel
                        const channel = await guild.channels.create({
                            name: channelName,
                            type: 0, // Text channel
                            topic: `Updates for ${channelName} environment`
                        });

                        console.log(`Discord channel created: ${channel.name} (${channel.id})`);
                        client.destroy();
                        
                        resolve({
                            success: true,
                            message: `Discord channel "${channelName}" created successfully`,
                            channelName: channelName,
                            channelId: channel.id
                        });

                    } catch (error) {
                        console.error('Error creating Discord channel:', error);
                        client.destroy();
                        
                        resolve({
                            success: false,
                            message: `Failed to create Discord channel: ${error.message}`,
                            channelName: channelName
                        });
                    }
                });

                client.on('error', (error) => {
                    console.error('Discord client error:', error);
                    client.destroy();
                    
                    resolve({
                        success: false,
                        message: `Discord connection failed: ${error.message}`,
                        channelName: channelName
                    });
                });

                // Login to Discord
                client.login(discordToken).catch((error) => {
                    console.error('Discord login failed:', error);
                    resolve({
                        success: false,
                        message: `Discord login failed. Please create channel "${channelName}" manually.`,
                        channelName: channelName
                    });
                });
            });

        } catch (error) {
            console.error('Error in Discord channel creation:', error);
            return { 
                success: false, 
                message: `Error creating Discord channel: ${error.message}`,
                channelName: channelName
            };
        }
    }




    // Discord channel creation using Discord API
    async createDiscordChannel(channelName) {
        console.log('🚀 Launching Chrome with profile picker + debugging...');
        
        // Close existing Chrome processes first
        console.log('🔄 Closing existing Chrome instances...');
        try {
            const { execSync } = require('child_process');
            execSync('pkill -f "Google Chrome"', { stdio: 'ignore' });
            console.log('⏳ Waiting for Chrome processes to fully close...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.log('📱 No Chrome processes found to close');
        }
        
        const path = require('path');
        
        // Check if multiple profiles exist
        let shouldShowProfilePicker = false;
        try {
            const localStateFile = path.join(realUserDataDir, 'Local State');
            if (require('fs').existsSync(localStateFile)) {
                const localState = JSON.parse(require('fs').readFileSync(localStateFile, 'utf8'));
                const profiles = localState.profile?.info_cache || {};
                const profileCount = Object.keys(profiles).length;
                
                if (profileCount > 1) {
                    shouldShowProfilePicker = true;
                    console.log(`👤 Found ${profileCount} Chrome profiles - will show profile picker`);
                } else {
                    console.log(`👤 Found ${profileCount} Chrome profile - will use default`);
                }
            }
        } catch (error) {
            console.log('📱 Could not read Chrome profiles, showing profile picker anyway');
            shouldShowProfilePicker = true;
        }
        
        const chromeArgs = [
            `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${realUserDataDir}`,
            '--no-first-run',
            '--disable-default-apps'
        ];
        
        // Add profile picker if multiple profiles exist
        if (shouldShowProfilePicker) {
            chromeArgs.push('--show-profile-picker-on-startup');
            console.log('👤 Profile picker will appear - select your Google account');
            console.log('🔧 Debugging will be enabled once you select a profile');
        } else {
            console.log('👤 Using your default Chrome profile');
            console.log('🔧 Debugging enabled on default profile');
        }
        
        // Add the Drive folder URL
        chromeArgs.push(folderUrl);
        
        console.log(`🔧 Chrome args: ${chromeArgs.join(' ')}`);
        
        const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromeArgs, {
            detached: true,
            stdio: 'ignore'
        });
        
        chromeProcess.unref();
        console.log('✅ Chrome launched with profile picker + debugging');
    }

    // Wait for debugging connection while user selects profile
    async waitForDebuggingConnectionWithProfileSelection(debugPort) {
        console.log('🔗 Waiting for Chrome debugging connection...');
        console.log('👤 Please select your Google account profile from the Chrome picker');
        console.log('⏳ The debugging connection will establish after profile selection');
        console.log('');
        
        let connected = false;
        let attempts = 0;
        const maxAttempts = 90; // 3 minutes for profile selection + connection
        
        while (!connected && attempts < maxAttempts) {
            try {
                const req = http.request({
                    hostname: 'localhost',
                    port: debugPort,
                    path: '/json/version',
                    method: 'GET',
                    timeout: 3000
                });
                
                const response = await new Promise((resolve, reject) => {
                    let responseData = '';
                    req.on('response', (res) => {
                        res.on('data', chunk => responseData += chunk);
                        res.on('end', () => {
                            resolve({ statusCode: res.statusCode, data: responseData });
                        });
                    });
                    req.on('error', reject);
                    req.on('timeout', () => reject(new Error('timeout')));
                    req.end();
                });
                
                if (response.statusCode === 200) {
                    console.log('✅ Chrome debugging connection established');
                    
                    // Verify we have pages
                    try {
                        const listReq = http.request({
                            hostname: 'localhost',
                            port: debugPort,
                            path: '/json/list',
                            method: 'GET',
                            timeout: 3000
                        });
                        
                        const listResponse = await new Promise((resolve, reject) => {
                            let data = '';
                            listReq.on('response', (res) => {
                                res.on('data', chunk => data += chunk);
                                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
                            });
                            listReq.on('error', reject);
                            listReq.on('timeout', () => reject(new Error('timeout')));
                            listReq.end();
                        });
                        
                        if (listResponse.statusCode === 200) {
                            const pages = JSON.parse(listResponse.data);
                            console.log(`📄 Found ${pages.length} Chrome pages/tabs`);
                            if (pages.length > 0) {
                                connected = true;
                                break;
                            } else {
                                console.log('⏳ Chrome connected but no pages yet (profile still being selected)');
                            }
                        }
                    } catch (listError) {
                        console.log('⚠️ Page list check failed, but basic connection works');
                        connected = true;
                        break;
                    }
                }
                
            } catch (error) {
                // Connection not ready yet - this is normal during profile selection
            }
            
            attempts++;
            if (attempts <= 30) {
                if (attempts % 5 === 0) {
                    console.log(`👤 Waiting for profile selection... (${attempts}/90)`);
                }
            } else if (attempts <= 60) {
                if (attempts % 10 === 0) {
                    console.log(`🔗 Waiting for debugging connection... (${attempts}/90)`);
                }
            } else {
                if (attempts % 10 === 0) {
                    console.log(`⏰ Extended wait... (${attempts}/90)`);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (!connected) {
            console.log('❌ Could not establish debugging connection');
            console.log(`🔍 Chrome might be running but not accepting connections on port ${debugPort}`);
            console.log('💡 Make sure you selected a profile from the Chrome picker');
            throw new Error(`Could not connect to Chrome on port ${debugPort}`);
        }
    }

    // Step 1: Launch Chrome with profile picker only (no debugging)
    async launchProfilePicker(realUserDataDir) {
        console.log('👤 Step 1: Launching Chrome profile picker...');
        
        const path = require('path');
        
        // Check if multiple profiles exist
        let profileCount = 1;
        try {
            const localStateFile = path.join(realUserDataDir, 'Local State');
            if (require('fs').existsSync(localStateFile)) {
                const localState = JSON.parse(require('fs').readFileSync(localStateFile, 'utf8'));
                const profiles = localState.profile?.info_cache || {};
                profileCount = Object.keys(profiles).length;
            }
        } catch (error) {
            console.log('📱 Could not read Chrome profiles, assuming multiple profiles exist');
            profileCount = 2; // Assume multiple to show picker
        }
        
        if (profileCount <= 1) {
            console.log('👤 Only one profile found, skipping profile picker');
            return;
        }
        
        console.log(`👤 Found ${profileCount} Chrome profiles`);
        
        const chromeArgs = [
            `--user-data-dir=${realUserDataDir}`,
            '--show-profile-picker-on-startup',
            '--no-first-run',
            '--disable-default-apps'
        ];
        
        console.log('🚀 Opening Chrome profile picker...');
        const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromeArgs, {
            detached: true,
            stdio: 'ignore'
        });
        
        chromeProcess.unref();
        console.log('✅ Chrome profile picker opened');
    }

    // Step 2: Wait for user to select profile and get input
    async waitForProfileSelection(realUserDataDir) {
        console.log('👤 Step 2: Profile selection...');
        
        // First, show available profiles
        const path = require('path');
        const fs = require('fs');
        
        try {
            const localStateFile = path.join(realUserDataDir, 'Local State');
            if (fs.existsSync(localStateFile)) {
                const localState = JSON.parse(fs.readFileSync(localStateFile, 'utf8'));
                const profiles = localState.profile?.info_cache || {};
                const profileNames = Object.keys(profiles);
                
                console.log('👤 Available Chrome profiles:');
                profileNames.forEach((profile, index) => {
                    const profileInfo = profiles[profile];
                    const name = profileInfo.name || 'Unnamed';
                    const email = profileInfo.user_name || 'No email';
                    console.log(`   ${index + 1}. ${profile} - ${name} (${email})`);
                });
                
                console.log('');
                console.log('📋 Instructions:');
                console.log('1. Look at the profile list above');
                console.log('2. Select your Google account from the Chrome profile picker');
                console.log('3. The script will automatically detect your selection');
                console.log('');
                
                // Give user time to select
                console.log('⏳ Please select your profile now... (30 seconds)');
                for (let i = 30; i >= 1; i--) {
                    process.stdout.write(`\r⏳ Waiting for profile selection... ${i}s remaining`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log('\n✅ Profile selection time completed');
                
                return profileNames;
            }
        } catch (error) {
            console.log('⚠️ Could not read profiles, proceeding with manual timing...');
        }
        
        // Fallback timing
        console.log('⏳ Please select your Google account profile from the picker...');
        console.log('⏳ Waiting 30 seconds for selection...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        console.log('✅ Profile selection time completed');
        return [];
    }

    // Step 3: Get the selected profile by checking which directory was most recently accessed
    async getSelectedProfile(realUserDataDir, availableProfiles = []) {
        console.log('🔍 Step 3: Determining selected profile...');
        
        const path = require('path');
        const fs = require('fs');
        
        try {
            // Method 1: Check which profile directory was most recently modified
            console.log('🔍 Checking profile directory access times...');
            let mostRecentProfile = null;
            let mostRecentTime = 0;
            
            for (const profileName of availableProfiles) {
                try {
                    const profileDir = path.join(realUserDataDir, profileName);
                    if (fs.existsSync(profileDir)) {
                        const stats = fs.statSync(profileDir);
                        const accessTime = Math.max(stats.mtime.getTime(), stats.atime.getTime());
                        
                        console.log(`   📁 ${profileName}: last accessed ${new Date(accessTime).toLocaleTimeString()}`);
                        
                        if (accessTime > mostRecentTime) {
                            mostRecentTime = accessTime;
                            mostRecentProfile = profileName;
                        }
                    }
                } catch (profileError) {
                    console.log(`   ⚠️ Could not check ${profileName}: ${profileError.message}`);
                }
            }
            
            if (mostRecentProfile) {
                console.log(`👤 Most recently used profile: ${mostRecentProfile}`);
                return mostRecentProfile;
            }
            
            // Method 2: Check Local State file for last_used
            const localStateFile = path.join(realUserDataDir, 'Local State');
            if (fs.existsSync(localStateFile)) {
                const localState = JSON.parse(fs.readFileSync(localStateFile, 'utf8'));
                const lastUsedProfile = localState.profile?.last_used;
                
                if (lastUsedProfile && availableProfiles.includes(lastUsedProfile)) {
                    console.log(`👤 Found last used profile from Local State: ${lastUsedProfile}`);
                    return lastUsedProfile;
                }
            }
            
            // Method 3: Find a profile with Google account (not Default or Person 1)
            const localStateFile2 = path.join(realUserDataDir, 'Local State');
            if (fs.existsSync(localStateFile2)) {
                const localState = JSON.parse(fs.readFileSync(localStateFile2, 'utf8'));
                const profiles = localState.profile?.info_cache || {};
                
                for (const profileKey of availableProfiles) {
                    const profileInfo = profiles[profileKey];
                    if (profileInfo?.user_name && profileInfo.user_name.includes('@')) {
                        console.log(`👤 Found Google account profile: ${profileKey} (${profileInfo.user_name})`);
                        return profileKey;
                    }
                }
            }
            
            // Method 4: Use first non-default profile
            const nonDefaultProfile = availableProfiles.find(p => p !== 'Default');
            if (nonDefaultProfile) {
                console.log(`👤 Using first non-default profile: ${nonDefaultProfile}`);
                return nonDefaultProfile;
            }
            
        } catch (error) {
            console.log('⚠️ Could not determine selected profile:', error.message);
        }
        
        console.log('👤 Falling back to Default profile');
        return 'Default';
    }

    // Step 4: Launch Chrome with debugging using selected profile
    async launchChromeWithDebuggingAndProfile(profileName, debugPort, folderUrl) {
        console.log('🔧 Step 4: Launching Chrome with debugging and selected profile...');
        
        const os = require('os');
        const path = require('path');
        const realUserDataDir = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
        
        // First, close any existing Chrome instances to avoid conflicts
        console.log('🔄 Closing existing Chrome instances...');
        try {
            const { execSync } = require('child_process');
            execSync('pkill -f "Google Chrome"', { stdio: 'ignore' });
            console.log('⏳ Waiting for Chrome processes to fully close...');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Longer wait
        } catch (error) {
            console.log('📱 No Chrome processes found to close');
        }
        
        const chromeArgs = [
            `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${realUserDataDir}`,
            `--profile-directory=${profileName}`,
            '--no-first-run',
            '--disable-default-apps',
            folderUrl
        ];
        
        console.log(`🚀 Launching Chrome with debugging on port ${debugPort}...`);
        console.log(`👤 Using profile: ${profileName}`);
        console.log(`📁 Opening: ${folderUrl}`);
        console.log(`🔧 Chrome args: ${chromeArgs.join(' ')}`);
        
        try {
            const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromeArgs, {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'] // Capture output for debugging
            });
            
            chromeProcess.unref();
            
            // Verify Chrome process started
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if Chrome process is still running
            const { execSync } = require('child_process');
            try {
                const processCheck = execSync(`ps aux | grep "remote-debugging-port=${debugPort}" | grep -v grep`, { encoding: 'utf8' });
                if (processCheck) {
                    console.log('✅ Chrome launched with debugging enabled');
                    console.log(`🔍 Process: ${processCheck.trim()}`);
                } else {
                    console.log('⚠️ Chrome launched but debugging process not found');
                }
            } catch (psError) {
                console.log('⚠️ Could not verify Chrome process, but continuing...');
            }
            
        } catch (launchError) {
            console.error('❌ Failed to launch Chrome:', launchError);
            throw new Error(`Chrome launch failed: ${launchError.message}`);
        }
    }

    // Step 5: Wait for debugging connection with improved retry logic
    async waitForDebuggingConnection(debugPort) {
        console.log('🔗 Step 5: Waiting for Chrome debugging connection...');
        
        let connected = false;
        let attempts = 0;
        const maxAttempts = 60; // More attempts for debugging startup
        
        // Give Chrome more time to start initially
        console.log('⏳ Giving Chrome time to start up with debugging...');
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        while (!connected && attempts < maxAttempts) {
            try {
                const req = http.request({
                    hostname: 'localhost',
                    port: debugPort,
                    path: '/json/version',
                    method: 'GET',
                    timeout: 5000 // Longer timeout per request
                });
                
                const response = await new Promise((resolve, reject) => {
                    let responseData = '';
                    req.on('response', (res) => {
                        res.on('data', chunk => responseData += chunk);
                        res.on('end', () => {
                            resolve({ statusCode: res.statusCode, data: responseData });
                        });
                    });
                    req.on('error', reject);
                    req.on('timeout', () => reject(new Error('timeout')));
                    req.end();
                });
                
                if (response.statusCode === 200) {
                    console.log('✅ Chrome debugging connection established');
                    
                    // Also check that we can get the page list
                    try {
                        const listReq = http.request({
                            hostname: 'localhost',
                            port: debugPort,
                            path: '/json/list',
                            method: 'GET',
                            timeout: 3000
                        });
                        
                        const listResponse = await new Promise((resolve, reject) => {
                            let data = '';
                            listReq.on('response', (res) => {
                                res.on('data', chunk => data += chunk);
                                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
                            });
                            listReq.on('error', reject);
                            listReq.on('timeout', () => reject(new Error('timeout')));
                            listReq.end();
                        });
                        
                        if (listResponse.statusCode === 200) {
                            const pages = JSON.parse(listResponse.data);
                            console.log(`📄 Found ${pages.length} Chrome pages/tabs`);
                            connected = true;
                            break;
                        }
                    } catch (listError) {
                        console.log('⚠️ Page list check failed, but basic connection works');
                        connected = true;
                        break;
                    }
                }
                
            } catch (error) {
                // Connection not ready yet
                if (attempts % 10 === 0) {
                    console.log(`🔍 Connection attempt ${attempts}: ${error.message}`);
                }
            }
            
            attempts++;
            if (attempts <= 20) {
                console.log(`⏳ Waiting for Chrome startup... (${attempts}/${maxAttempts})`);
            } else if (attempts <= 40) {
                console.log(`🔄 Still waiting for debugging connection... (${attempts}/${maxAttempts})`);
            } else {
                console.log(`⏰ Extended wait for Chrome... (${attempts}/${maxAttempts})`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (!connected) {
            // Try one more manual check
            console.log('🔍 Final connection attempt...');
            try {
                const finalReq = http.request({
                    hostname: 'localhost',
                    port: debugPort,
                    path: '/json/version',
                    method: 'GET',
                    timeout: 10000
                });
                
                await new Promise((resolve, reject) => {
                    finalReq.on('response', () => {
                        console.log('✅ Final attempt successful!');
                        connected = true;
                        resolve();
                    });
                    finalReq.on('error', reject);
                    finalReq.on('timeout', () => reject(new Error('timeout')));
                    finalReq.end();
                });
            } catch (finalError) {
                // Still failed
            }
        }
        
        if (!connected) {
            console.log('❌ Could not establish debugging connection');
            console.log(`🔍 Chrome might be running but not accepting connections on port ${debugPort}`);
            console.log('💡 Try manually opening Chrome with debugging:');
            console.log(`   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${debugPort}`);
            throw new Error(`Could not connect to Chrome on port ${debugPort}`);
        }
    }

    // Launch Chrome for manual work (sheet creation) - LEGACY METHOD
    async launchChromeForManualWork(folderId) {
        try {
            console.log('🚀 Launching Chrome with your profile for manual sheet creation...');
            console.log('📋 This will:');
            console.log('1. Show profile picker (if multiple profiles)');
            console.log('2. Open Chrome with debugging enabled');
            console.log('3. Navigate to your Drive folder');
            console.log('4. You can manually create the required sheets');
            console.log('');
            
            const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
            const debugPort = 9224; // Different from server debug port (9223)
            
            const os = require('os');
            const path = require('path');
            
            // Use your actual Chrome profile directory
            const realUserDataDir = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
            
            // Check if multiple profiles exist
            let shouldShowProfilePicker = false;
            try {
                const localStateFile = path.join(realUserDataDir, 'Local State');
                if (require('fs').existsSync(localStateFile)) {
                    const localState = JSON.parse(require('fs').readFileSync(localStateFile, 'utf8'));
                    const profiles = localState.profile?.info_cache || {};
                    const profileCount = Object.keys(profiles).length;
                    
                    if (profileCount > 1) {
                        shouldShowProfilePicker = true;
                        console.log(`👤 Found ${profileCount} Chrome profiles - will show profile picker`);
                    } else {
                        console.log(`👤 Found ${profileCount} Chrome profile - will use default`);
                    }
                }
            } catch (error) {
                console.log('📱 Could not read Chrome profiles, using default');
            }
            
            const chromeArgs = [
                `--remote-debugging-port=${debugPort}`,
                `--user-data-dir=${realUserDataDir}`,
                '--no-first-run',
                '--disable-default-apps'
            ];
            
            // Add profile picker if multiple profiles exist
            if (shouldShowProfilePicker) {
                chromeArgs.push('--show-profile-picker-on-startup');
                console.log('👤 Profile picker will appear - select your Google account');
                console.log('📁 After profile selection, Chrome will open to your Drive folder');
            } else {
                console.log('👤 Using your default Chrome profile');
                console.log('📁 Chrome will open directly to your Drive folder');
            }
            
            // Add the Drive folder URL
            chromeArgs.push(folderUrl);
            
            console.log(`🔧 Debug port: ${debugPort} (separate from server debug port 9223)`);
            console.log(`📂 Profile directory: ${realUserDataDir}`);
            console.log(`📁 Will open: ${folderUrl}`);
            console.log('');
            
            const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromeArgs, {
                detached: true,
                stdio: 'ignore'
            });
            
            chromeProcess.unref();
            
            console.log('✅ Chrome launched successfully!');
            console.log('🔐 Your Google account login will be preserved');
            console.log('📊 You can now manually create the following sheets:');
            console.log('   1. "Relevant Tweets"');
            console.log('   2. "[Environment Name] Follow Report"');
            console.log('');
            console.log('💡 Tips for manual sheet creation:');
            console.log('   • Click "New" > "Google Sheets"');
            console.log('   • Rename the sheet using the title field');
            console.log('   • Repeat for the second sheet');
            console.log('');
            
            return {
                success: true,
                debugPort: debugPort,
                folderUrl: folderUrl,
                message: 'Chrome opened successfully for manual sheet creation'
            };
            
        } catch (error) {
            console.error('❌ Error launching Chrome for manual work:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to launch Chrome. You can manually open the Drive folder.'
            };
        }
    }

    // Check if Chrome debugging is already available
    async checkExistingChromeDebug() {
        try {
            const req = http.request({
                hostname: 'localhost',
                port: 9223,
                path: '/json/version',
                method: 'GET',
                timeout: 2000
            });
            
            return new Promise((resolve) => {
                req.on('response', () => {
                    resolve(true);
                });
                req.on('error', () => resolve(false));
                req.on('timeout', () => resolve(false));
                req.end();
            });
        } catch (error) {
            return false;
        }
    }
    
    // Simple and reliable Chrome automation
    async smartChromeProfileSelection(folderUrl) {
        try {
            console.log('🎯 Simple Chrome automation approach');
            console.log('📍 Will create a clean Chrome instance for automation');
            
            // Use port 9224 to avoid conflicts with dashboard debug session
            const debugPort = 9224;
            
            console.log('');
            console.log('📋 SIMPLE PROCESS:');
            console.log('1. Check what Chrome processes are currently running');
            console.log('2. Launch dedicated Chrome for automation with debugging');
            console.log('3. Wait for Chrome to be ready');
            console.log('4. Open Drive folder and proceed with automation');
            console.log('');
            
            // Step 1: Show current Chrome processes for debugging
            console.log('🔍 Checking current Chrome processes...');
            
            const { execSync } = require('child_process');
            try {
                const psList = execSync('ps aux | grep "Google Chrome" | grep -v grep', { encoding: 'utf8' });
                const processes = psList.split('\n').filter(line => line.trim());
                console.log(`📋 Found ${processes.length} Chrome processes:`);
                processes.forEach((process, index) => {
                    if (process.includes('remote-debugging-port=9223')) {
                        console.log(`   ${index + 1}. 🔧 Dashboard Chrome (port 9223)`);
                    } else if (process.includes('remote-debugging-port=9222')) {
                        console.log(`   ${index + 1}. 🔧 Server Chrome (port 9222)`);
                    } else if (process.includes('remote-debugging-port')) {
                        console.log(`   ${index + 1}. 🔧 Debug Chrome (other port)`);
                    } else {
                        console.log(`   ${index + 1}. 📱 Normal Chrome`);
                    }
                });
            } catch (error) {
                console.log('📱 No Chrome processes found');
            }
            
            // Step 2: Launch Chrome with your existing profile + debugging
            console.log('🚀 Launching Chrome with your existing profile + debugging...');
            
            const os = require('os');
            const path = require('path');
            
            // Use your actual Chrome profile directory
            const realUserDataDir = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
            
            // Try to determine if we need to show profile picker or use default
            let shouldShowProfilePicker = false;
            
            // Check if there are multiple profiles
            try {
                const localStateFile = path.join(realUserDataDir, 'Local State');
                if (require('fs').existsSync(localStateFile)) {
                    const localState = JSON.parse(require('fs').readFileSync(localStateFile, 'utf8'));
                    const profiles = localState.profile?.info_cache || {};
                    const profileCount = Object.keys(profiles).length;
                    
                    if (profileCount > 1) {
                        shouldShowProfilePicker = true;
                        console.log(`👤 Found ${profileCount} Chrome profiles - will show profile picker`);
                    } else {
                        console.log(`👤 Found ${profileCount} Chrome profile - will use default`);
                    }
                }
            } catch (error) {
                console.log('📱 Could not read Chrome profiles, using default');
            }
            
            const chromeArgs = [
                `--remote-debugging-port=${debugPort}`,
                `--user-data-dir=${realUserDataDir}`,
                '--no-first-run',
                '--disable-default-apps'
            ];
            
            // Add profile picker if multiple profiles exist
            if (shouldShowProfilePicker) {
                chromeArgs.push('--profile-directory=');
                chromeArgs.push('--show-profile-picker-on-startup');
                console.log('👤 Will show profile picker for selection');
            } else {
                console.log('👤 Will use your default Chrome profile');
            }
            
            // Add the Drive folder URL
            chromeArgs.push(folderUrl);
            
            console.log(`📁 Will open Drive folder: ${folderUrl}`);
            console.log(`🔧 Debug port: ${debugPort}`);
            console.log(`📂 Profile directory: ${realUserDataDir}`);
            
            const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromeArgs, {
                detached: true,
                stdio: 'ignore'
            });
            
            chromeProcess.unref();
            
            console.log('✅ Chrome launched with your real profile + debugging');
            console.log('🔐 Using your existing Google account logins');
            console.log('⏳ Waiting for Chrome to start...');
            
            // Step 4: Wait for debugging connection and session restore
            let connected = false;
            let attempts = 0;
            const maxAttempts = 30; // More time for profile selection
            
            console.log(`🔍 Starting connection attempts to port ${debugPort}...`);
            
            while (!connected && attempts < maxAttempts) {
                try {
                    const req = http.request({
                        hostname: 'localhost',
                        port: debugPort,
                        path: '/json/version',
                        method: 'GET',
                        timeout: 3000
                    });
                    
                    const response = await new Promise((resolve, reject) => {
                        let data = '';
                        req.on('response', (res) => {
                            res.on('data', (chunk) => {
                                data += chunk;
                            });
                            res.on('end', () => {
                                resolve({ statusCode: res.statusCode, data: data });
                            });
                        });
                        req.on('error', reject);
                        req.on('timeout', () => reject(new Error('timeout')));
                        req.end();
                    });
                    
                    if (response.statusCode === 200) {
                        console.log('🔗 Basic debugging connection established');
                        
                        // Now check if we have actual browser pages
                        try {
                            const listReq = http.request({
                                hostname: 'localhost',
                                port: debugPort,
                                path: '/json/list',
                                method: 'GET',
                                timeout: 3000
                            });
                            
                            const listResponse = await new Promise((resolve, reject) => {
                                let data = '';
                                listReq.on('response', (res) => {
                                    res.on('data', (chunk) => {
                                        data += chunk;
                                    });
                                    res.on('end', () => {
                                        resolve({ statusCode: res.statusCode, data: data });
                                    });
                                });
                                listReq.on('error', reject);
                                listReq.on('timeout', () => reject(new Error('timeout')));
                                listReq.end();
                            });
                            
                            if (listResponse.statusCode === 200) {
                                const pages = JSON.parse(listResponse.data);
                                console.log(`📄 Found ${pages.length} pages in Chrome`);
                                
                                if (pages.length > 0) {
                                    console.log('✅ Chrome debugging connection established');
                                    console.log('👤 Profile selection completed');
                                    console.log('🎉 Ready to proceed with automation');
                                    connected = true;
                                    break;
                                } else {
                                    console.log('⏳ Chrome connected but no pages yet (profile selection in progress)');
                                }
                            }
                        } catch (listError) {
                            console.log('⏳ Chrome connected but pages list not ready yet');
                        }
                    }
                } catch (error) {
                    // Connection not ready yet
                    if (attempts % 5 === 0) {
                        console.log(`🔍 Connection attempt ${attempts}: ${error.message}`);
                    }
                }
                
                attempts++;
                if (attempts <= 10) {
                    console.log(`⏳ Waiting for Chrome startup... (${attempts}/${maxAttempts})`);
                } else if (attempts <= 20) {
                    console.log(`🔄 Waiting for session restore... (${attempts}/${maxAttempts})`);
                } else {
                    console.log(`⏳ Waiting for Chrome to be ready... (${attempts}/${maxAttempts})`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            if (!connected) {
                console.log('❌ Could not establish debugging connection automatically');
                console.log('🔍 Checking Chrome processes...');
                
                try {
                    const { execSync } = require('child_process');
                    const psList = execSync('ps aux | grep "Google Chrome" | grep -v grep', { encoding: 'utf8' });
                    console.log('📋 Current Chrome processes:');
                    const processes = psList.split('\n').filter(line => line.trim());
                    let foundDebugChrome = false;
                    
                    processes.forEach(process => {
                        if (process.includes(`remote-debugging-port=${debugPort}`)) {
                            console.log(`   ✅ ${process}`);
                            foundDebugChrome = true;
                        } else if (process.includes('remote-debugging-port')) {
                            console.log(`   🔧 ${process}`);
                        } else {
                            console.log(`   📱 ${process}`);
                        }
                    });
                    
                    if (foundDebugChrome) {
                        console.log('🎯 Chrome is running with debugging - trying manual connection...');
                        
                        // Try one more time with a simple connection
                        try {
                            const testReq = http.request({
                                hostname: 'localhost',
                                port: debugPort,
                                path: '/json/version',
                                method: 'GET',
                                timeout: 5000
                            });
                            
                            await new Promise((resolve, reject) => {
                                testReq.on('response', () => {
                                    console.log('✅ Manual connection successful! Proceeding...');
                                    connected = true;
                                    resolve();
                                });
                                testReq.on('error', reject);
                                testReq.on('timeout', () => reject(new Error('timeout')));
                                testReq.end();
                            });
                        } catch (testError) {
                            console.log('❌ Manual connection also failed');
                        }
                    }
                } catch (error) {
                    console.log('📱 No Chrome processes found');
                }
                
                if (!connected) {
                    throw new Error('Could not establish debugging connection. Please ensure Chrome is running with debugging on port ' + debugPort);
                }
            }
            
            // Step 3: Verify Drive folder is accessible (skip opening since Chrome already opened it)
            console.log('📁 Verifying Drive folder access in Chrome...');
            
            try {
                const browser = await puppeteer.connect({
                    browserURL: `http://localhost:${debugPort}`
                });
                
                // Get existing pages instead of creating new ones
                const pages = await browser.pages();
                console.log(`📄 Found ${pages.length} pages in Chrome`);
                
                let drivePage = null;
                for (const page of pages) {
                    const url = page.url();
                    if (url.includes('drive.google.com')) {
                        drivePage = page;
                        console.log('✅ Found Drive page already open');
                        break;
                    }
                }
                
                if (!drivePage && pages.length > 0) {
                    // Use the first available page and navigate to Drive
                    drivePage = pages[0];
                    console.log('🌐 Navigating existing page to Drive folder...');
                    try {
                        await drivePage.goto(folderUrl, { 
                            waitUntil: 'domcontentloaded', 
                            timeout: 15000 
                        });
                        console.log('✅ Navigated to Drive folder');
                    } catch (navError) {
                        console.log('⚠️ Navigation had issues, but continuing...');
                    }
                }
                
                console.log('✅ Drive folder access verified');
                console.log('🔐 Using your logged-in Google account');
                
                browser.disconnect(); // Don't close, just disconnect
            } catch (error) {
                console.error('❌ Failed to verify Drive folder access:', error);
                console.log('📁 Drive folder should be manually accessible in Chrome');
                console.log(`📁 URL: ${folderUrl}`);
            }
            
            return { success: true, debugPort: debugPort };
        } catch (error) {
            console.error('Error in smart Chrome profile selection:', error);
            return { success: false, error: error.message };
        }
    }

    // Launch Chrome with profile selection and debugging
    async launchChromeWithDebugging(folderId = null) {
        try {
            const folderUrl = folderId ? `https://drive.google.com/drive/folders/${folderId}` : 'https://drive.google.com';
            
            console.log('🔍 Checking for existing Chrome debug session...');
            const existingDebug = await this.checkExistingChromeDebug();
            
            if (existingDebug) {
                console.log('✅ Found existing Chrome debug session (preserving it)');
                console.log('🎯 Using SMART profile selection approach');
                console.log('📍 Dashboard Chrome will remain completely untouched');
            } else {
                console.log('🚀 No existing debug session found');
                console.log('🎯 Using smart profile selection approach');
            }
            
            console.log('');
            console.log('📋 SMART CHROME PROFILE APPROACH:');
            console.log('1. Profile picker opens WITHOUT killing any Chrome instances');
            console.log('2. You select your Google account profile');
            console.log('3. Only THAT profile instance gets restarted with debugging');
            console.log('4. Dashboard Chrome stays running on port 9223');
            console.log('5. Server Chrome stays running on port 9222');
            console.log('6. Drive folder opens in your selected profile with debugging');
            console.log('');
            
            // Use smart Chrome profile selection
            const launchResult = await this.smartChromeProfileSelection(folderUrl);
            if (!launchResult.success) {
                throw new Error(`Failed to launch Chrome with profile picker: ${launchResult.error}`);
            }
            
            const debugPort = launchResult.debugPort;
            
            // Wait for Chrome to start and verify debugging connection
            let connected = false;
            let attempts = 0;
            const maxAttempts = 30; // More time for profile selection
            
            console.log('⏳ Waiting for Chrome startup and profile selection...');
            
            while (!connected && attempts < maxAttempts) {
                try {
                    const req = http.request({
                        hostname: 'localhost',
                        port: debugPort,
                        path: '/json/version',
                        method: 'GET',
                        timeout: 2000
                    });
                    
                    await new Promise((resolve, reject) => {
                        req.on('response', () => {
                            connected = true;
                            resolve();
                        });
                        req.on('error', reject);
                        req.on('timeout', () => reject(new Error('timeout')));
                        req.end();
                    });
                    
                    if (connected) {
                        console.log('✅ Remote debugging connection verified');
                        console.log('🎉 Profile setup complete, automation will continue');
                        break;
                    }
                } catch (error) {
                    attempts++;
                    if (attempts <= 5) {
                        console.log(`⏳ Waiting for Chrome startup... (${attempts}/${maxAttempts})`);
                    } else if (attempts <= 20) {
                        console.log(`👤 Please set up your profile in Chrome... (${attempts}/${maxAttempts})`);
                    } else {
                        console.log(`⏳ Still waiting for connection... (${attempts}/${maxAttempts})`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            if (!connected) {
                throw new Error(`Could not connect to Chrome debug port ${debugPort}. Please ensure you selected a profile and Chrome is running with debugging enabled.`);
            }
            
            return {
                success: true,
                message: 'Chrome launched successfully with profile selection',
                folderUrl: folderUrl,
                debugPort: debugPort
            };
            
        } catch (error) {
            console.error('Error launching Chrome with debugging:', error);
            throw error;
        }
    }

    // Automate opening Drive and clicking New button only
    async automateNewButtonClick(folderId, debugPort = 9223) {
        let browser = null;
        
        try {
            console.log(`🔗 Connecting to logged-in Chrome debugging session on port ${debugPort}...`);
            browser = await puppeteer.connect({
                browserURL: `http://localhost:${debugPort}`
            });
            console.log('✅ Connected to logged-in Chrome instance');
            
            // Wait for browser to stabilize
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const pages = await browser.pages();
            console.log(`📄 Found ${pages.length} open pages`);
            
            let drivePage = null;
            const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
            
            // Find existing Drive page with retry mechanism
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const currentPages = await browser.pages();
                    for (const page of currentPages) {
                        try {
                            const url = await page.url();
                            if (url.includes('drive.google.com')) {
                                drivePage = page;
                                console.log('✅ Found existing Drive page');
                                break;
                            }
                        } catch (pageError) {
                            console.log('⚠️ Skipping detached page');
                            continue;
                        }
                    }
                    if (drivePage) break;
                } catch (error) {
                    console.log(`⏳ Retry ${attempt + 1}/3: Looking for Drive page...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            if (!drivePage) {
                console.log('📱 Creating new Drive page...');
                drivePage = await browser.newPage();
                await drivePage.setDefaultTimeout(30000);
                await drivePage.goto(folderUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 30000 
                });
            }
            
            // Ensure page is stable and loaded
            await this.waitForPageStability(drivePage);
            
            // Handle login if needed
            await this.handleGoogleLogin(drivePage);
            
            // Ensure we're on the correct folder with retry
            const currentUrl = await drivePage.url();
            if (!currentUrl.includes(folderId)) {
                console.log('🗂️ Navigating to target folder...');
                await drivePage.goto(folderUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 30000 
                });
                await this.waitForPageStability(drivePage);
            }
            
            // Wait for Drive interface to load
            console.log('⏳ Waiting for Drive interface...');
            await this.waitForDriveInterface(drivePage);
            
            // Click the New button and stop
            console.log('🖱️ Clicking the New button...');
            
            // Use the specific selector you provided
            const newButtonSelector = 'button[guidedhelpid="new_menu_button"]';
            
            try {
                await drivePage.waitForSelector(newButtonSelector, { timeout: 15000 });
                await drivePage.click(newButtonSelector);
                console.log('✅ New button clicked successfully using guidedhelpid selector!');
                
                // Wait for the menu to appear
                console.log('⏳ Waiting for New menu to appear...');
                await drivePage.waitForSelector('div[role="menu"][aria-haspopup="true"]:not([style*="display: none"])', { timeout: 10000 });
                console.log('✅ New menu is now open!');
                
                // Click the Google Sheets option
                console.log('🖱️ Clicking Google Sheets option...');
                const sheetsSelector = 'div[role="menuitem"]:has(img[src*="icon_1_spreadsheet_x16.png"])';
                await drivePage.waitForSelector(sheetsSelector, { timeout: 10000 });
                await drivePage.click(sheetsSelector);
                console.log('✅ Google Sheets option clicked successfully!');
                
                // Wait for new sheet to open
                console.log('⏳ Waiting for new Google Sheet to open...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log('✅ New Google Sheet should now be opening!');
                
            } catch (error) {
                console.log('⚠️ Specific selector failed, trying fallback selectors...');
                const fallbackSelector = await this.waitForDriveInterfaceRobust(drivePage);
                await this.clickWithRetry(drivePage, fallbackSelector, 'New button');
                
                // Try to click Google Sheets with fallback approach
                try {
                    console.log('🖱️ Trying fallback Google Sheets selection...');
                    await this.waitForAndClickGoogleSheets(drivePage);
                } catch (sheetsError) {
                    console.log('⚠️ Could not automatically select Google Sheets, menu is open for manual selection');
                }
            }
            
            console.log('🛑 Automation stopped as requested');
            console.log('📝 New Google Sheet should be opening automatically!');
            
            return {
                success: true,
                message: 'New button clicked and Google Sheets automatically opened!'
            };
            
        } catch (error) {
            console.error('❌ Chrome automation failed:', error);
            throw error;
        } finally {
            if (browser) {
                browser.disconnect();
            }
        }
    }
    
    // Wait for page stability to avoid detachment errors
    async waitForPageStability(page) {
        try {
            // Wait for network to be idle and page to be stable
            await page.waitForLoadState?.('networkidle') || 
                  page.waitForTimeout(3000);
            
            // Additional stability check
            await page.evaluate(() => {
                return new Promise(resolve => {
                    if (document.readyState === 'complete') {
                        resolve();
                    } else {
                        window.addEventListener('load', resolve);
                    }
                });
            });
            
            console.log('✅ Page stabilized');
        } catch (error) {
            console.log('⚠️ Page stability check had issues, continuing...');
        }
    }

    // Handle Google login if required
    async handleGoogleLogin(page) {
        try {
            const currentUrl = await page.url();
            if (currentUrl.includes('accounts.google.com')) {
                console.log('🔐 Google login detected. Waiting for authentication...');
                
                try {
                    await page.waitForFunction(() => {
                        return window.location.href.includes('drive.google.com');
                    }, { timeout: 60000 });
                    console.log('✅ Login completed');
                } catch (error) {
                    throw new Error('Login timeout - please ensure you are logged into Google Drive');
                }
            }
        } catch (error) {
            console.log('⚠️ Login check had issues:', error.message);
        }
    }
    
    // Wait for Drive interface elements to load
    async waitForDriveInterface(page) {
        const selectors = [
            '[data-target="drive.new"]',
            'button[aria-label*="New"]',
            '.a-s-fa-Ha-pa',
            '[role="button"][aria-label*="New"]'
        ];
        
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 10000 });
                console.log(`✅ Found Drive interface element: ${selector}`);
                return selector;
            } catch (error) {
                console.log(`⏳ Trying alternative selector...`);
            }
        }
        
        throw new Error('Could not find Drive interface elements');
    }

    // Create a single sheet in the existing page with robust error handling
    async createSingleSheetInPageRobust(page, sheetName, folderUrl) {
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`📝 Creating sheet: "${sheetName}" (attempt ${attempt}/${maxRetries})`);
                
                // Ensure we're on the right page with stability check
                await this.waitForPageStability(page);
                
                const currentUrl = await page.url();
                if (!currentUrl.includes('drive.google.com')) {
                    console.log('🗂️ Navigating to Drive folder...');
                    await page.goto(folderUrl, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 30000 
                    });
                    await this.waitForPageStability(page);
                }
                
                // Wait for Drive interface with extended timeout
                const newButtonSelector = await this.waitForDriveInterfaceRobust(page);
                
                // Click "New" button with retry
                await this.clickWithRetry(page, newButtonSelector, 'New button');
                
                // Wait for dropdown menu with multiple selectors
                const menuVisible = await Promise.race([
                    page.waitForSelector('[role="menuitem"]', { timeout: 10000 }).then(() => true),
                    page.waitForSelector('.a-s-fa-Ha-pa-xa', { timeout: 10000 }).then(() => true),
                    new Promise(resolve => setTimeout(() => resolve(false), 10000))
                ]);
                
                if (!menuVisible) {
                    throw new Error('Menu did not appear after clicking New button');
                }
                
                // Find and click Google Sheets option with improved selection
                const sheetsClicked = await page.evaluate(() => {
                    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], .a-s-fa-Ha-pa-xa'));
                    const sheetsItem = menuItems.find(item => {
                        const text = item.textContent || '';
                        return text.includes('Google Sheets') || 
                               text.includes('Spreadsheet') ||
                               text.includes('Sheets');
                    });
                    
                    if (sheetsItem) {
                        sheetsItem.click();
                        return true;
                    }
                    return false;
                });
                
                if (!sheetsClicked) {
                    throw new Error('Could not find or click Google Sheets option');
                }
                
                // Wait for new sheet to open with extended timeout
                console.log('⏳ Waiting for new sheet to open...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Find the new sheet tab with retry mechanism
                let sheetPage = null;
                for (let pageAttempt = 0; pageAttempt < 5; pageAttempt++) {
                    const allPages = await page.browser().pages();
                    
                    for (const p of allPages) {
                        try {
                            const url = await p.url();
                            if (url.includes('docs.google.com/spreadsheets')) {
                                sheetPage = p;
                                console.log('✅ Found new sheet tab');
                                break;
                            }
                        } catch (pageError) {
                            continue;
                        }
                    }
                    
                    if (sheetPage) break;
                    
                    console.log(`⏳ Looking for new sheet tab... (${pageAttempt + 1}/5)`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                if (!sheetPage) {
                    throw new Error('Could not find newly created sheet tab');
                }
                
                // Wait for sheet to load and stabilize
                await this.waitForPageStability(sheetPage);
                
                // Rename the sheet with retry mechanism
                console.log(`🏷️ Renaming sheet to "${sheetName}"`);
                
                const titleRenamed = await this.renameSheetWithRetry(sheetPage, sheetName);
                if (!titleRenamed) {
                    console.log('⚠️ Could not rename sheet, but continuing...');
                }
                
                // Get sheet ID from URL
                const sheetUrl = await sheetPage.url();
                const sheetId = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
                
                if (!sheetId) {
                    throw new Error('Could not extract sheet ID from URL');
                }
                
                console.log(`✅ Created sheet "${sheetName}" with ID: ${sheetId}`);
                
                // Close the sheet tab to return to Drive
                try {
                    await sheetPage.close();
                } catch (closeError) {
                    console.log('⚠️ Could not close sheet tab, but continuing...');
                }
                
                return sheetId;
                
            } catch (error) {
                console.error(`❌ Attempt ${attempt} failed for sheet "${sheetName}":`, error.message);
                
                if (attempt === maxRetries) {
                    throw new Error(`Failed to create sheet "${sheetName}" after ${maxRetries} attempts: ${error.message}`);
                }
                
                // Wait before retry
                console.log(`⏳ Retrying in 3 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }

    // Robust version of waitForDriveInterface with better error handling
    async waitForDriveInterfaceRobust(page) {
        const selectors = [
            'button[guidedhelpid="new_menu_button"]', // User's specific selector - try first
            '[data-target="drive.new"]',
            'button[aria-label*="New"]',
            '.a-s-fa-Ha-pa',
            '[role="button"][aria-label*="New"]',
            '.a-s-fa-Ha-pa-cg',
            '[data-tooltip="New"]'
        ];
        
        for (let attempt = 0; attempt < 3; attempt++) {
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 15000 });
                    console.log(`✅ Found Drive interface element: ${selector}`);
                    return selector;
                } catch (error) {
                    console.log(`⏳ Trying alternative selector...`);
                }
            }
            
            if (attempt < 2) {
                console.log(`⏳ Retrying Drive interface detection (${attempt + 1}/3)...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                await this.waitForPageStability(page);
            }
        }
        
        throw new Error('Could not find Drive interface elements after multiple attempts');
    }

    // Click with retry mechanism to handle detached elements
    async clickWithRetry(page, selector, elementName) {
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await page.waitForSelector(selector, { timeout: 10000 });
                await page.click(selector);
                console.log(`✅ Clicked ${elementName}`);
                return;
            } catch (error) {
                console.log(`⚠️ Click attempt ${attempt} failed for ${elementName}: ${error.message}`);
                
                if (attempt === maxRetries) {
                    throw new Error(`Failed to click ${elementName} after ${maxRetries} attempts`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.waitForPageStability(page);
            }
        }
    }

    // Rename sheet with retry mechanism
    async renameSheetWithRetry(sheetPage, sheetName) {
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Wait for title input to be available
                await sheetPage.waitForSelector('#docs-title-input', { timeout: 20000 });
                
                // Click to focus
                await sheetPage.click('#docs-title-input');
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Select all and replace
                await sheetPage.keyboard.down('Meta');
                await sheetPage.keyboard.press('KeyA');
                await sheetPage.keyboard.up('Meta');
                
                // Clear and type new name
                await sheetPage.keyboard.press('Backspace');
                await sheetPage.type('#docs-title-input', sheetName, { delay: 100 });
                await sheetPage.keyboard.press('Enter');
                
                // Wait for save
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                console.log(`✅ Successfully renamed sheet to "${sheetName}"`);
                return true;
                
            } catch (error) {
                console.log(`⚠️ Rename attempt ${attempt} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        
        return false;
    }

    // Fallback method to find and click Google Sheets option
    async waitForAndClickGoogleSheets(page) {
        const selectors = [
            'div[role="menuitem"]:has(img[src*="icon_1_spreadsheet_x16.png"])', // Your specific selector
            '[role="menuitem"]:has-text("Google Sheets")',
            '[role="menuitem"]:has-text("Spreadsheet")',
            '.a-s-fa-Ha-pa-xa:has-text("Google Sheets")'
        ];
        
        // Wait for menu to be visible
        await page.waitForSelector('[role="menu"]', { timeout: 10000 });
        
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                await page.click(selector);
                console.log(`✅ Google Sheets clicked using selector: ${selector}`);
                return;
            } catch (error) {
                console.log(`⏳ Trying next Google Sheets selector...`);
            }
        }
        
        // Fallback: try to find by text content
        try {
            const sheetsClicked = await page.evaluate(() => {
                const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], .a-s-fa-Ha-pa-xa'));
                const sheetsItem = menuItems.find(item => {
                    const text = item.textContent || '';
                    return text.includes('Google Sheets') || 
                           text.includes('Spreadsheet') ||
                           text.includes('Sheets');
                });
                
                if (sheetsItem) {
                    sheetsItem.click();
                    return true;
                }
                return false;
            });
            
            if (sheetsClicked) {
                console.log('✅ Google Sheets clicked using text content fallback');
                return;
            }
        } catch (error) {
            console.log('⚠️ Text content fallback also failed');
        }
        
        throw new Error('Could not find Google Sheets option in menu');
    }
    
    // Create IFTTT applets for automation
    async createIFTTTApplets(envData) {
        try {
            console.log('🔗 Creating IFTTT applets...');
            
            const applets = [
                {
                    name: `${envData.envName} - New Tweet Alert`,
                    trigger: 'webhooks',
                    action: 'discord',
                    description: `Send Discord notification when new ${envData.envName} tweet is added`
                },
                {
                    name: `${envData.envName} - Follow Report`,
                    trigger: 'webhooks', 
                    action: 'sheets',
                    description: `Log follow actions to ${envData.envName} Follow Report sheet`
                }
            ];
            
            const createdApplets = [];
            
            for (const applet of applets) {
                console.log(`🔧 Creating applet: ${applet.name}`);
                
                // For now, provide instructions since IFTTT API requires paid plan
                const instructions = {
                    name: applet.name,
                    trigger: 'Webhooks - Receive a web request',
                    triggerEvent: applet.name.toLowerCase().replace(/\s+/g, '_'),
                    action: applet.action === 'discord' ? 
                        'Discord - Post a message to channel' : 
                        'Google Sheets - Add row to spreadsheet',
                    webhookUrl: `https://maker.ifttt.com/trigger/${applet.name.toLowerCase().replace(/\s+/g, '_')}/with/key/YOUR_IFTTT_KEY`,
                    instructions: [
                        `1. Go to https://ifttt.com/create`,
                        `2. Choose "Webhooks" as trigger`,
                        `3. Set event name: ${applet.name.toLowerCase().replace(/\s+/g, '_')}`,
                        `4. Choose "${applet.action === 'discord' ? 'Discord' : 'Google Sheets'}" as action`,
                        applet.action === 'discord' ? 
                            `5. Configure Discord channel and message format` :
                            `5. Configure Google Sheets target: ${envData.envName} Follow Report`,
                        `6. Save and turn on the applet`
                    ]
                };
                
                createdApplets.push(instructions);
            }
            
            return {
                success: true,
                applets: createdApplets,
                message: 'IFTTT applet instructions generated. Manual setup required.'
            };
            
        } catch (error) {
            console.error('❌ Error creating IFTTT applets:', error);
            return {
                success: false,
                message: `Failed to create applets: ${error.message}`
            };
        }
    }
}

module.exports = EnvironmentAutomation;