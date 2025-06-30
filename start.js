#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get topic from command line arguments
const topic = process.argv[2];

if (!topic) {
  console.log('Usage: node start.js <topic>');
  console.log('Available topics: ethereum, basketball, crypto');
  console.log('Example: node start.js ethereum');
  process.exit(1);
}

// Check if topic exists in config
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ config.json not found');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (!config[topic]) {
  console.error(`❌ Topic '${topic}' not found in config.json`);
  console.log('Available topics:', Object.keys(config).join(', '));
  process.exit(1);
}

console.log(`🚀 Starting XBot for topic: ${topic}`);
console.log(`📊 Configuration: ${config[topic].name}`);
console.log(`🔍 Search query: ${config[topic].searchQuery}`);
console.log(`👥 Followers threshold: ${config[topic].followersThreshold}`);

// Set environment variable
process.env.TOPIC = topic;

// Start the server
const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  env: process.env
});

server.on('close', (code) => {
  console.log(`\n🛑 Server stopped with code ${code}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  server.kill('SIGTERM');
}); 