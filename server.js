require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const { spawn, exec } = require('child_process');
const fs = require('fs');

// Import routes
const searchRoute = require('./routes/search');
const myTopRoute = require('./routes/myTop');
const engagersRoute = require('./routes/engagers');
const followRouter = require('./routes/follow');
const monitorRouter = require('./routes/monitor');
const topicAssociationRouter = require('./routes/topicAssociation');

const app = express();

// Function to kill existing Chrome debug processes (Windows-specific)
async function killExistingDebugChrome() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      console.log('🔧 Checking for existing Chrome debug processes...');
      
      // First check if port 9222 is in use
      exec('netstat -ano | findstr :9222', (error, stdout) => {
        if (error || !stdout.trim()) {
          console.log('ℹ️ No Chrome debug process found on port 9222');
          resolve();
          return;
        }
        
        // Extract PID from netstat output
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            pids.add(pid);
          }
        });
        
        if (pids.size === 0) {
          console.log('ℹ️ No Chrome debug processes to kill');
          resolve();
          return;
        }
        
        console.log(`🔧 Killing Chrome debug processes: ${Array.from(pids).join(', ')}`);
        
        // Kill only the specific PIDs using port 9222
        const killCommands = Array.from(pids).map(pid => `taskkill /f /pid ${pid}`);
        const killCommand = killCommands.join(' & ');
        
        exec(killCommand, (killError) => {
          if (killError) {
            console.log('⚠️ Some Chrome debug processes may not have been killed');
          } else {
            console.log('✅ Killed Chrome debug processes');
          }
          // Wait a moment for processes to fully terminate
          setTimeout(resolve, 2000);
        });
      });
    } else {
      resolve();
    }
  });
}

// Function to start Chrome with remote debugging (cross-platform)
async function startChrome() {
  return new Promise(async (resolve) => {
    console.log('🚀 Starting Google Chrome with remote debugging...');
    
    // Kill existing Chrome debug processes first
    await killExistingDebugChrome();
    
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';
    
    let chromeCommand, chromeArgs, userDataDir;
    
    if (isWindows) {
      // Windows Chrome paths (try common locations)
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
      ];
      
      chromeCommand = possiblePaths.find(path => {
        try {
          const fs = require('fs');
          return fs.existsSync(path);
        } catch (e) {
          return false;
        }
      }) || 'chrome'; // Fallback to PATH
      
      userDataDir = process.env.TEMP + '\\chrome-profile';
      chromeArgs = [
        '--remote-debugging-port=9222',
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-web-security',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ];
    } else if (isMac) {
      // macOS
      chromeCommand = 'open';
      userDataDir = '/tmp/chrome-profile';
      chromeArgs = [
        '-na', 'Google Chrome',
        '--args',
        '--remote-debugging-port=9222',
        `--user-data-dir=${userDataDir}`
      ];
    } else if (isLinux) {
      // Linux
      chromeCommand = 'google-chrome';
      userDataDir = '/tmp/chrome-profile';
      chromeArgs = [
        '--remote-debugging-port=9222',
        `--user-data-dir=${userDataDir}`,
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ];
    } else {
      console.error('❌ Unsupported platform:', process.platform);
      resolve(false);
      return;
    }
    
    console.log(`📱 Platform: ${process.platform}`);
    console.log(`🔧 Chrome command: ${chromeCommand}`);
    console.log(`📁 User data dir: ${userDataDir}`);
    
    try {
      // Start Chrome with remote debugging
      const chromeProcess = spawn(chromeCommand, chromeArgs, { 
        detached: true,
        stdio: 'ignore'
      });
      
      chromeProcess.on('error', (error) => {
        console.error('❌ Failed to start Chrome:', error.message);
        console.log('💡 Make sure Google Chrome is installed and accessible');
        resolve(false);
      });
      
      // Wait for Chrome to start
      console.log('⏳ Waiting for Chrome to start...');
      setTimeout(() => {
        // Check if Chrome is ready (cross-platform)
        let chromeReady = false;
        let attempts = 0;
        const maxAttempts = 30;
        
        const checkChrome = () => {
          attempts++;
          const http = require('http');
          
          console.log(`⏳ Checking Chrome readiness (attempt ${attempts}/${maxAttempts})...`);
          
          const req = http.get('http://127.0.0.1:9222/json/version', (res) => {
            console.log(`📡 Chrome response status: ${res.statusCode}`);
            if (res.statusCode === 200 && !chromeReady) {
              console.log('✅ Chrome is ready on port 9222');
              chromeReady = true;
              resolve(true);
            } else if (!chromeReady) {
              if (attempts >= maxAttempts) {
                console.error('❌ Chrome failed to start after maximum attempts');
                resolve(false);
              } else {
                setTimeout(checkChrome, 2000);
              }
            }
          });
          
          req.on('error', (error) => {
            console.log(`❌ HTTP request error: ${error.message}`);
            if (!chromeReady) {
              if (attempts >= maxAttempts) {
                console.error('❌ Chrome failed to start after maximum attempts');
                console.log('💡 Try manually opening Chrome and checking if port 9222 is available');
                resolve(false);
              } else {
                console.log(`⏳ Still waiting for Chrome... (${attempts}/${maxAttempts})`);
                setTimeout(checkChrome, 2000);
              }
            }
          });
          
          req.setTimeout(5000, () => {
            console.log('⏰ Request timeout');
            req.abort();
            if (!chromeReady) {
              if (attempts >= maxAttempts) {
                console.error('❌ Chrome failed to start after maximum attempts');
                console.log('💡 Try manually opening Chrome and checking if port 9222 is available');
                resolve(false);
              } else {
                setTimeout(checkChrome, 2000);
              }
            }
          });
        };
        checkChrome();
      }, 3000);
      
    } catch (error) {
      console.error('❌ Error starting Chrome:', error.message);
      resolve(false);
    }
  });
}

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'xbot-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Routes
app.get('/', (req, res) => res.redirect('/tweets'));

app.get('/tweets', (req, res) => {
  res.render('dashboard'); // Single dashboard view for both tweet types
});

// Topic middleware
function topicMiddleware(req, res, next) {
  const fs = require('fs');
  const configPath = path.join(__dirname, 'config.json');
  
  if (!fs.existsSync(configPath)) {
    return res.status(500).json({ success: false, message: 'Config file not found' });
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const topic = req.session.topic || process.env.TOPIC;
  
  if (!topic || !config[topic]) {
    return res.status(400).json({ 
      success: false, 
      message: 'No topic selected. Please select a topic first.',
      needsTopicSelection: true 
    });
  }
  
  req.topicConfig = config[topic];
  req.topic = topic;
  next();
}

// Topic selection endpoint
app.post('/set-topic', (req, res) => {
  const { topic } = req.body;
  const fs = require('fs');
  const configPath = path.join(__dirname, 'config.json');
  
  if (!fs.existsSync(configPath)) {
    return res.status(400).json({ success: false, message: 'Config file not found' });
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config[topic]) {
    return res.status(400).json({ success: false, message: 'Invalid topic' });
  }
  
  // Store topic in session and environment
  req.session.topic = topic;
  process.env.TOPIC = topic;
  
  res.json({ success: true, message: `Topic set to ${topic}` });
});

// Get topic configuration endpoint
app.post('/get-topic-config', (req, res) => {
  const { topic } = req.body;
  const fs = require('fs');
  const configPath = path.join(__dirname, 'config.json');
  
  if (!fs.existsSync(configPath)) {
    return res.status(400).json({ success: false, message: 'Config file not found' });
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config[topic]) {
    return res.status(400).json({ success: false, message: 'Invalid topic' });
  }
  
  res.json({ success: true, config: config[topic] });
});

// Get current topic from session
app.get('/get-current-topic', (req, res) => {
  const topic = req.session.topic || process.env.TOPIC;
  
  if (topic) {
    res.json({ success: true, topic: topic });
  } else {
    res.json({ success: false, message: 'No topic set' });
  }
});

// Get available topics endpoint
app.get('/get-available-topics', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: false,
        message: 'Config file not found'
      });
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const topics = Object.keys(config).map(key => ({
      key: key,
      name: config[key].name
    }));
    
    res.json({
      success: true,
      topics: topics
    });
  } catch (error) {
    console.error('Error loading topics:', error);
    res.json({
      success: false,
      message: 'Error loading topics from config'
    });
  }
});

// API Routes with topic middleware
app.use('/search', topicMiddleware, searchRoute);
app.use('/my-top', myTopRoute);
app.use('/my-engagers', engagersRoute);
app.use('/follow', topicMiddleware, followRouter);
app.use('/monitor', topicMiddleware, monitorRouter);
app.use('/topic-association', topicMiddleware, topicAssociationRouter);

// Server start
const PORT = process.env.PORT || 3000;

async function startServer() {
  // Start Chrome first
  await startChrome();
  
  // Then start the Express server
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 Google Sheets Monitor available at http://localhost:${PORT}/monitor`);
  });
}

startServer();
