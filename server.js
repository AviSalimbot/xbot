require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const { spawn, exec } = require('child_process');

// Import routes
const searchRoute = require('./routes/search');
const myTopRoute = require('./routes/myTop');
const engagersRoute = require('./routes/engagers');
const followRouter = require('./routes/follow');
const monitorRouter = require('./routes/monitor');
const topicAssociationRouter = require('./routes/topicAssociation');

const app = express();

// Function to start Chrome with remote debugging (cross-platform)
async function startChrome() {
  return new Promise((resolve) => {
    console.log('🚀 Starting Google Chrome with remote debugging...');
    
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
        '--no-default-browser-check'
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
        const checkChrome = () => {
          const http = require('http');
          const req = http.get('http://localhost:9222', (res) => {
            if (!chromeReady) {
              console.log('✅ Chrome is ready on port 9222');
              chromeReady = true;
              resolve(true);
            }
          });
          
          req.on('error', () => {
            if (!chromeReady) {
              console.log('⏳ Still waiting for Chrome...');
              setTimeout(checkChrome, 2000);
            }
          });
          
          req.setTimeout(1000, () => {
            req.abort();
            if (!chromeReady) {
              setTimeout(checkChrome, 2000);
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
