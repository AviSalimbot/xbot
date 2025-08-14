const http = require('http');

console.log('🧪 Testing Chrome connection...');

const req = http.get('http://127.0.0.1:9222/json/version', (res) => {
  console.log(`📡 Response status: ${res.statusCode}`);
  console.log(`📡 Response headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('📄 Response body:', data);
    console.log('✅ Chrome connection successful!');
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

req.setTimeout(5000, () => {
  console.log('⏰ Request timeout');
  req.abort();
}); 