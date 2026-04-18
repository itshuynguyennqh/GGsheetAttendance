const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const router = express.Router();
const REGISTRY_PATH = path.join(__dirname, '..', 'data', 'azota-api-registry.json');

const STATUSES = ['working', 'deprecated', 'broken', 'unknown'];

function readRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { endpoints: [], meta: { source: 'manual', lastUpdated: null } };
    }
    throw e;
  }
}

function writeRegistry(data) {
  const dir = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/azota-api-registry — Lấy toàn bộ registry
router.get('/', (req, res) => {
  try {
    const data = readRegistry();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/azota-api-registry — Ghi đè toàn bộ registry (endpoints + meta)
router.put('/', (req, res) => {
  try {
    const { endpoints = [], meta = {} } = req.body;
    const normalized = (Array.isArray(endpoints) ? endpoints : []).map((ep) => {
      const id = ep.id || randomUUID();
      const status = STATUSES.includes(ep.status) ? ep.status : 'unknown';
      return {
        id,
        method: String(ep.method || 'GET').toUpperCase(),
        path: String(ep.path || '').trim() || '/',
        baseUrl: ep.baseUrl != null ? String(ep.baseUrl).trim() : '',
        description: ep.description != null ? String(ep.description) : '',
        status,
        lastCheckedAt: ep.lastCheckedAt || null,
        lastSuccessAt: ep.lastSuccessAt || null,
        notes: ep.notes != null ? String(ep.notes) : '',
        createdAt: ep.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    const data = {
      endpoints: normalized,
      meta: {
        source: meta.source || 'manual',
        lastUpdated: new Date().toISOString(),
      },
    };
    writeRegistry(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/azota-api-registry/endpoints — Thêm một endpoint
router.post('/endpoints', (req, res) => {
  try {
    const reg = readRegistry();
    const ep = req.body || {};
    const id = ep.id || randomUUID();
    const status = STATUSES.includes(ep.status) ? ep.status : 'unknown';
    const now = new Date().toISOString();
    const newEp = {
      id,
      method: String(ep.method || 'GET').toUpperCase(),
      path: String(ep.path || '').trim() || '/',
      baseUrl: ep.baseUrl != null ? String(ep.baseUrl).trim() : '',
      description: ep.description != null ? String(ep.description) : '',
      status,
      lastCheckedAt: ep.lastCheckedAt || null,
      lastSuccessAt: ep.lastSuccessAt || null,
      notes: ep.notes != null ? String(ep.notes) : '',
      createdAt: now,
      updatedAt: now,
    };
    reg.endpoints.push(newEp);
    reg.meta = reg.meta || {};
    reg.meta.lastUpdated = now;
    writeRegistry(reg);
    res.status(201).json(newEp);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/azota-api-registry/endpoints/:id — Cập nhật một endpoint (trạng thái, notes, lastCheckedAt...)
router.patch('/endpoints/:id', (req, res) => {
  try {
    const reg = readRegistry();
    const idx = reg.endpoints.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Endpoint not found' });
    const ep = reg.endpoints[idx];
    const body = req.body || {};
    const allowed = ['method', 'path', 'baseUrl', 'description', 'status', 'lastCheckedAt', 'lastSuccessAt', 'notes'];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key === 'status' && !STATUSES.includes(body[key])) continue;
        ep[key] = key === 'status' ? body[key] : body[key];
      }
    }
    ep.updatedAt = new Date().toISOString();
    reg.meta = reg.meta || {};
    reg.meta.lastUpdated = ep.updatedAt;
    writeRegistry(reg);
    res.json(ep);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/azota-api-registry/endpoints/:id
router.delete('/endpoints/:id', (req, res) => {
  try {
    const reg = readRegistry();
    const idx = reg.endpoints.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Endpoint not found' });
    reg.endpoints.splice(idx, 1);
    reg.meta = reg.meta || {};
    reg.meta.lastUpdated = new Date().toISOString();
    writeRegistry(reg);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
