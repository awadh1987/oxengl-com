const http = require('http');
const axios = require('axios');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_HEALTH_URL || 'http://127.0.0.1:8000/api/v1/health';
const PROXY_PORT = parseInt(process.env.API_GATEWAY_PORT || '8001', 10);

console.log('🚀 [OXENGL API] Process manager representation active.');

async function checkApiHealth() {
  try {
    const res = await axios.get(BACKEND_URL, { timeout: 3000 });
    console.log(`[OXENGL API HEALTH] Upstream FastAPI responsive: ${res.status} (${JSON.stringify(res.data)})`);
  } catch (err) {
    console.warn(`[OXENGL API HEALTH] Upstream check warning: ${err.message}`);
  }
}

checkApiHealth();
setInterval(checkApiHealth, 15000);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'online', service: 'oxengl-api', timestamp: new Date().toISOString() }));
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`[OXENGL API] Monitoring bridge listening on 127.0.0.1:${PROXY_PORT}`);
});
