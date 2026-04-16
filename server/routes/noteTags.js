const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === '1';
    const sql = includeInactive
      ? 'SELECT * FROM note_tags ORDER BY sortOrder'
      : 'SELECT * FROM note_tags WHERE isActive = 1 ORDER BY sortOrder';
    const rows = db.prepare(sql).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { label, type, icon, sortOrder } = req.body;
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'label is required' });
    }
    const result = db.prepare(
      'INSERT INTO note_tags (label, type, icon, sortOrder) VALUES (?, ?, ?, ?)'
    ).run(String(label).trim(), type || 'neutral', icon || null, sortOrder ?? 0);
    const row = db.prepare('SELECT * FROM note_tags WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { label, type, icon, sortOrder, isActive } = req.body;
    const existing = db.prepare('SELECT * FROM note_tags WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Tag not found' });

    db.prepare(`
      UPDATE note_tags SET
        label = COALESCE(?, label),
        type = COALESCE(?, type),
        icon = COALESCE(?, icon),
        sortOrder = COALESCE(?, sortOrder),
        isActive = COALESCE(?, isActive)
      WHERE id = ?
    `).run(
      label ?? null,
      type ?? null,
      icon ?? null,
      sortOrder ?? null,
      isActive ?? null,
      req.params.id
    );

    const row = db.prepare('SELECT * FROM note_tags WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM note_tags WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Tag not found' });

    db.prepare('UPDATE note_tags SET isActive = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/seed', (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM note_tags').get().n;
    if (count > 0) {
      return res.json({ ok: true, message: 'Tags already exist', count });
    }

    const defaults = [
      { label: 'Phát biểu', type: 'positive', icon: '🙋', sortOrder: 1 },
      { label: 'Tập trung tốt', type: 'positive', icon: '🎯', sortOrder: 2 },
      { label: 'Hỗ trợ bạn', type: 'positive', icon: '🤝', sortOrder: 3 },
      { label: 'Quên bài', type: 'negative', icon: '📝', sortOrder: 4 },
      { label: 'Làm việc riêng', type: 'negative', icon: '📱', sortOrder: 5 },
      { label: 'Đi muộn', type: 'negative', icon: '⏰', sortOrder: 6 },
    ];

    const stmt = db.prepare(
      'INSERT INTO note_tags (label, type, icon, sortOrder) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction((items) => {
      for (const t of items) {
        stmt.run(t.label, t.type, t.icon, t.sortOrder);
      }
    });
    tx(defaults);

    const rows = db.prepare('SELECT * FROM note_tags ORDER BY sortOrder').all();
    res.status(201).json({ ok: true, tags: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
