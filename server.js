require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

// Import routes
const searchRoute = require('./routes/search');
const myTopRoute = require('./routes/myTop');
const engagersRoute = require('./routes/engagers');
const followRouter = require('./routes/follow');
const monitorRouter = require('./routes/monitor');
const topicAssociationRouter = require('./routes/topicAssociation');

const app = express();

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => res.redirect('/tweets'));

app.get('/tweets', (req, res) => {
  res.render('dashboard'); // Single dashboard view for both tweet types
});

// API Routes
app.use('/search', searchRoute);
app.use('/my-top', myTopRoute);
app.use('/my-engagers', engagersRoute);
app.use('/follow', followRouter);
app.use('/monitor', monitorRouter);
app.use('/topic-association', topicAssociationRouter);

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Google Sheets Monitor available at http://localhost:${PORT}/monitor`);
});
