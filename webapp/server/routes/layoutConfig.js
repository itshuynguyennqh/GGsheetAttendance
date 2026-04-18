const express = require('express');
const router = express.Router({ mergeParams: true });
const { db } = require('../db');

router.get('/', (req, res) => {
  try {
    const classId = Number(req.params.classId);
    const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const row = db.prepare(
      'SELECT rows, cols, disabledSeats FROM class_layout_config WHERE classId = ?'
    ).get(classId);

    if (!row) {
      return res.json({ classId, rows: 4, cols: 7, disabledSeats: [] });
    }

    res.json({
      classId,
      rows: row.rows,
      cols: row.cols,
      disabledSeats: JSON.parse(row.disabledSeats || '[]'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', (req, res) => {
  try {
    const classId = Number(req.params.classId);
    const { rows, cols, disabledSeats } = req.body;

    if (!Number.isInteger(rows) || rows < 1 || rows > 20) {
      return res.status(400).json({ error: 'rows must be integer 1-20' });
    }
    if (!Number.isInteger(cols) || cols < 1 || cols > 20) {
      return res.status(400).json({ error: 'cols must be integer 1-20' });
    }

    const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const disabledJson = JSON.stringify(Array.isArray(disabledSeats) ? disabledSeats : []);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO class_layout_config (classId, rows, cols, disabledSeats, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(classId) DO UPDATE SET rows = excluded.rows, cols = excluded.cols, disabledSeats = excluded.disabledSeats, updatedAt = excluded.updatedAt
    `).run(classId, rows, cols, disabledJson, now, now);

    res.json({
      classId,
      rows,
      cols,
      disabledSeats: JSON.parse(disabledJson),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
