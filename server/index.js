const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const { initSchema } = require('./db');
const coursesRouter = require('./routes/courses');
const classesRouter = require('./routes/classes');
const studentsRouter = require('./routes/students');
const sessionsRouter = require('./routes/sessions');
const attendanceRouter = require('./routes/attendance');
const dashboardRouter = require('./routes/dashboard');
const azotaApiRegistryRouter = require('./routes/azotaApiRegistry');
// #region agent log
let azotaExamResultRouter;
try {
  azotaExamResultRouter = require('./routes/azotaExamResult');
  console.log('[DEBUG] azotaExamResult router loaded successfully');
} catch (e) {
  console.error('[DEBUG] Failed to load azotaExamResult router:', e.message);
  console.error('[DEBUG] Stack:', e.stack);
  throw e;
}
// #endregion agent log

initSchema();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(compression());
// Tăng limit cho import điểm danh (payload lớn)
app.use(express.json({ limit: '10mb' }));

const DEBUG_API = process.env.DEBUG_API === '1' || process.env.DEBUG === '1';

app.use((req, res, next) => {
  const start = Date.now();
  if (DEBUG_API) {
    const meta = { method: req.method, path: req.originalUrl };
    if (Object.keys(req.query || {}).length) meta.query = req.query;
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      meta.body = req.body;
    }
    console.debug('[API]', meta);
  }
  res.once('finish', () => {
    const duration = Date.now() - start;
    if (DEBUG_API) {
      console.debug('[API]', `→ ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    } else {
      console.log(`[api] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

app.use('/api/courses', coursesRouter);
app.use('/api/classes', classesRouter);
app.use('/api/students', studentsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/azota-api-registry', azotaApiRegistryRouter);
// #region agent log
console.log('[DEBUG] Mounting /api/azota-exam-result route');
// #endregion agent log
app.use('/api/azota-exam-result', azotaExamResultRouter);

// Error handler middleware để log stack trace
app.use((err, req, res, next) => {
  if (DEBUG_API) {
    console.error('[ERROR]', err.message);
    console.error('[STACK]', err.stack);
  } else {
    console.error('[ERROR]', err.message);
  }
  if (!res.headersSent) {
    res.status(500).json({ error: err.message });
  }
});

const specPath = path.join(__dirname, '..', 'docs', 'openapi-server.yaml');
const specPathAlt = path.join(__dirname, '..', 'docs', 'openapi.yaml');
let spec;
try {
  const fs = require('fs');
  const yaml = require('yaml');
  if (fs.existsSync(specPath)) {
    spec = yaml.parse(fs.readFileSync(specPath, 'utf8'));
  } else if (fs.existsSync(specPathAlt)) {
    spec = yaml.parse(fs.readFileSync(specPathAlt, 'utf8'));
  }
} catch (_) {}

if (spec) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
} else {
  app.get('/api-docs', (req, res) => {
    res.send('OpenAPI spec not found. Create docs/openapi-server.yaml for Swagger UI.');
  });
}

// Swagger UI cho Azota API (unofficial, từ HAR)
const azotaSpecPath = path.join(__dirname, '..', 'docs', 'azota-openapi.yaml');
let azotaSpec;
try {
  const fs = require('fs');
  const yaml = require('yaml');
  if (fs.existsSync(azotaSpecPath)) {
    azotaSpec = yaml.parse(fs.readFileSync(azotaSpecPath, 'utf8'));
    app.use('/api-docs-azota', swaggerUi.serve, swaggerUi.setup(azotaSpec));
  }
} catch (_) {}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('');
  console.log(`[server] API: http://localhost:${PORT}`);
  console.log(`[server] Docs: http://localhost:${PORT}/api-docs`);
  if (azotaSpec) console.log(`[server] Azota API Docs: http://localhost:${PORT}/api-docs-azota`);
  console.log('');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`[ERROR] Port ${PORT} đang được sử dụng!`);
    console.error(`[ERROR] Có thể đã có instance khác của server đang chạy.`);
    console.error('');
    console.error('Giải pháp:');
    console.error(`  1. Tìm và kill process đang dùng port ${PORT}:`);
    console.error(`     netstat -ano | findstr :${PORT}`);
    console.error(`     taskkill /PID <PID> /F`);
    console.error(`  2. Hoặc đổi port bằng cách set env: PORT=3002`);
    console.error('');
    process.exit(1);
  } else {
    console.error('[ERROR]', err);
    process.exit(1);
  }
});
