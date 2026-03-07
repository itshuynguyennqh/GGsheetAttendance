/**
 * Dev server với log từng request và proxy CSV (tránh CORS).
 * Chạy: npm run dev
 */
const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DEV_ROOT = path.join(__dirname);

// Log mọi request: method, path, IP, status, thời gian
app.use((req, res, next) => {
  const start = Date.now();
  res.once('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const time = new Date().toLocaleString('vi-VN', { hour12: false });
    const msg = `HTTP  ${time}  ${req.ip}  ${req.method} ${req.originalUrl || req.url}  → ${status}  (${ms} ms)`;
    console.log(msg);
    if (status === 404) {
      console.log('  [DEBUG] 404 – Kiểm tra đường dẫn file có tồn tại trong thư mục dev/ không.');
    }
  });
  next();
});

app.use(express.static(DEV_ROOT));

// Proxy CSV từ Google Sheet (tránh CORS khi Publish to web)
app.get('/proxy', (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    res.status(400).set('Access-Control-Allow-Origin', '*').send('Missing query: url');
    return;
  }
  const lib = url.indexOf('https:') === 0 ? https : http;
  lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dashboard/1)' } }, (getRes) => {
    let body = '';
    getRes.on('data', (chunk) => { body += chunk; });
    getRes.on('end', () => {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(getRes.statusCode).send(body);
    });
  }).on('error', (err) => {
    res.status(500).set('Access-Control-Allow-Origin', '*').send(err.message || 'Proxy error');
  });
});

// Fallback: / → index.html
app.get('/', (req, res, next) => {
  res.sendFile(path.join(DEV_ROOT, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.listen(PORT, () => {
  console.log('');
  console.log(`[dev] Dashboard local: http://localhost:${PORT}`);
  console.log('[dev] Dữ liệu: Google Sheet → Publish to web (CSV) → config.js CSV_URL.');
  console.log('[dev] Nếu CORS: dùng CSV_URL = /proxy?url=' + encodeURIComponent('https://docs.google.com/.../export?format=csv&gid=...'));
  console.log('');
});
