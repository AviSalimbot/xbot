# XBot Scalability Guide

XBot now supports multiple topics through a configuration-based system. You can easily switch between different topics like Ethereum, Basketball, Crypto, etc.

## Quick Start

### 1. Start with a specific topic:
```bash
# For Ethereum
node start.js ethereum

# For Basketball  
node start.js basketball

# For Crypto
node start.js crypto
```

### 2. Environment Variables:
The system automatically sets `TOPIC=ethereum` (or your chosen topic) when you use the start script.

## Configuration

All topic configurations are stored in `config.json`:

```json
{
  "ethereum": {
    "name": "Ethereum",
    "searchQuery": "ethereum -scam -giveaway -airdrop -bot -pump -dump",
    "userSearchQuery": "ethereum",
    "sheetPrefix": "Ethereum Tweets",
    "followersThreshold": 2000,
    "followAccountsThreshold": 5000,
    "statusMessages": {
      "following": "Following Ethereum accounts, please wait...",
      "monitoring": "📊 Monitors latest 'Ethereum Tweets' spreadsheet for new rows"
    },
    "filePrefix": "Ethereum Follow Report"
  }
}
```

## Adding New Topics

1. **Edit `config.json`** and add a new topic configuration
2. **Create the corresponding Google Sheets** with the specified `sheetPrefix`
3. **Start the bot** with your new topic: `node start.js your-topic`

## Configuration Parameters

| Parameter | Description |
|-----------|-------------|
| `name` | Display name for the topic |
| `searchQuery` | Twitter search query for finding tweets |
| `userSearchQuery` | Twitter search query for finding users to follow |
| `sheetPrefix` | Prefix for Google Sheets (e.g., "Ethereum Tweets") |
| `followersThreshold` | Minimum followers required for tweet processing |
| `followAccountsThreshold` | Minimum followers required for following accounts |
| `statusMessages` | UI messages for the dashboard |
| `filePrefix` | Prefix for generated Excel files |

## Files Updated for Scalability

- ✅ `followEthereumAccounts.js` → `followAccounts.js` (scalable)
- ✅ `config.json` (new configuration file)
- ✅ `start.js` (new startup script)
- ✅ `routes/follow.js` (updated imports)
- ✅ `views/dashboard.ejs` (dynamic text)

## Usage Examples

```bash
# Start Ethereum bot
node start.js ethereum

# Start Basketball bot  
node start.js basketball

# Start Crypto bot
node start.js crypto

# Check available topics
node start.js
```

## Manual Environment Variable

You can also set the topic manually:
```bash
export TOPIC=basketball
node server.js
```

## Monitoring Different Topics

Each topic will:
- Monitor its own Google Sheets (based on `sheetPrefix`)
- Use topic-specific search queries
- Apply topic-specific follower thresholds
- Generate topic-specific reports

The system is now fully scalable and can handle any number of topics by simply adding configurations to `config.json`. 