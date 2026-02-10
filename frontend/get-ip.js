
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const PROXY_URL = 'http://127.0.0.1:7897';
const agent = new HttpsProxyAgent(PROXY_URL);

console.log('Querying outbound IP via Proxy...');

const options = {
    hostname: 'api.ipify.org',
    port: 443,
    path: '/',
    method: 'GET',
    agent: agent
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('\n========================================');
        console.log('你的代理出口 IP 是:', data);
        console.log('========================================');
        console.log('如果你要在币安设置 "受信任 IP"，请填写上面这个！');
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
});

req.end();
