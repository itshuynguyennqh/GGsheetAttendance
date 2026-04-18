const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  try {
    const { studentId, sessionId } = req.query;
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    let sql = `
      SELECT n.*, t.label as tagLabel, t.icon as tagIcon, t.type as tagType
      FROM student_session_notes n
      LEFT JOIN note_tags t ON n.tagId = t.id
      WHERE n.studentId = ?
    `;
    const params = [studentId];

    if (sessionId) {
      sql += ' AND n.sessionId = ?';
      params.push(sessionId);
    }

    sql += ' ORDER BY n.createdAt DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/timeline', (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const rows = db.prepare(`
      SELECT n.*, s.ngayHoc, t.label as tagLabel, t.icon as tagIcon, t.type as tagType
      FROM student_session_notes n
      JOIN sessions s ON n.sessionId = s.id
      LEFT JOIN note_tags t ON n.tagId = t.id
      WHERE n.studentId = ?
      ORDER BY s.ngayHoc DESC, n.createdAt DESC
    `).all(studentId);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/summary', (req, res) => {
  try {
    const { studentId, sessionId } = req.query;
    if (!studentId || !sessionId) {
      return res.status(400).json({ error: 'studentId and sessionId are required' });
    }

    const rows = db.prepare(`
      SELECT n.tagId, COUNT(*) as count, t.label as tagLabel, t.type as tagType
      FROM student_session_notes n
      LEFT JOIN note_tags t ON n.tagId = t.id
      WHERE n.studentId = ? AND n.sessionId = ?
      GROUP BY n.tagId
    `).all(studentId, sessionId);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { studentId, sessionId, tagId, content, type } = req.body;

    if (!studentId) return res.status(400).json({ error: 'studentId is required' });
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    let noteType = type || 'neutral';
    if (tagId) {
      const tag = db.prepare('SELECT type FROM note_tags WHERE id = ?').get(tagId);
      if (tag) noteType = tag.type;
    }

    const result = db.prepare(
      'INSERT INTO student_session_notes (studentId, sessionId, tagId, content, type) VALUES (?, ?, ?, ?, ?)'
    ).run(studentId, sessionId, tagId || null, content || null, noteType);

    const row = db.prepare(`
      SELECT n.*, t.label as tagLabel, t.icon as tagIcon, t.type as tagType
      FROM student_session_notes n
      LEFT JOIN note_tags t ON n.tagId = t.id
      WHERE n.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM student_session_notes WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Note not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
