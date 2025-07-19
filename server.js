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

// Function to start Chrome with remote debugging
async function startChrome() {
  return new Promise((resolve) => {
    console.log('🚀 Starting Google Chrome with remote debugging...');
    
    // Start Chrome with remote debugging
    const chromeProcess = spawn('open', [
      '-na', 'Google Chrome',
      '--args',
      '--remote-debugging-port=9222',
      '--user-data-dir=/tmp/chrome-profile'
    ], { detached: true });
    
    // Wait for Chrome to start
    console.log('⏳ Waiting for Chrome to start...');
    setTimeout(() => {
      // Check if Chrome is ready
      const checkChrome = () => {
        exec('curl -s http://localhost:9222', (error) => {
          if (!error) {
            console.log('✅ Chrome is ready on port 9222');
            resolve(true);
          } else {
            console.log('⏳ Still waiting for Chrome...');
            setTimeout(checkChrome, 2000);
          }
        });
      };
      checkChrome();
    }, 3000);
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
