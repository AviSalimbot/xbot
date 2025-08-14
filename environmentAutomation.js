const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { Client, GatewayIntentBits } = require('discord.js');

class EnvironmentAutomation {
    constructor() {
        // Simple constructor - no browser needed
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

    // Main automation function - simplified to just create folder and config
    async createEnvironment(envData) {
        try {
            console.log('🚀 Starting environment creation process...');
            console.log('📋 Process: API folder creation → Manual setup checklist');
            
            // Step 1: Create Google Drive folder using API
            console.log('📁 Step 1: Creating Google Drive folder via API...');
            const authorizedParentFolderId = '10xvEyem4vrIIGosiTMbqijEgvslKxH4i';
            const folderId = await this.createGoogleDriveFolder(envData.envName, authorizedParentFolderId);
            if (!folderId) {
                throw new Error('Failed to create Google Drive folder');
            }
            console.log(`✅ Folder created successfully: ${folderId}`);
            
            // Step 2: Update config.json
            console.log('⚙️ Step 2: Updating configuration...');
            envData.folderId = folderId;
            this.updateConfig(envData);
            
            // Step 3: Attempt Discord channel creation (optional)
            console.log('💬 Step 3: Attempting Discord channel creation...');
            let discordResult = null;
            try {
                discordResult = await this.createDiscordChannel(envData.discordChannelName);
            } catch (error) {
                console.log('Discord channel creation failed, will need manual setup:', error.message);
                discordResult = { success: false, message: 'Manual Discord setup required' };
            }
            
            // Step 4: Generate IFTTT applet instructions
            console.log('🔗 Step 4: Generating IFTTT applet instructions...');
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