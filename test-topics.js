const fs = require('fs');
const path = require('path');

console.log('🧪 Testing topics endpoint logic...');

try {
  const configPath = path.join(__dirname, 'config.json');
  console.log('📁 Config path:', configPath);
  
  if (!fs.existsSync(configPath)) {
    console.log('❌ Config file not found');
    process.exit(1);
  }
  
  console.log('✅ Config file exists');
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✅ Config parsed successfully');
  console.log('📋 Config keys:', Object.keys(config));
  
  const topics = Object.keys(config).map(key => ({
    key: key,
    name: config[key].name
  }));
  
  console.log('🎯 Topics array:', topics);
  
  const response = {
    success: true,
    topics: topics
  };
  
  console.log('📤 Response:', JSON.stringify(response, null, 2));
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('❌ Stack:', error.stack);
} 