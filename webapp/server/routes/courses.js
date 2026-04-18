const express = require('express');
const router = express.Router();
const { db, setLastEdit, logError } = require('../db');

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM courses ORDER BY id').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, azotaClassId } = req.body;
    const result = db.prepare(
      'INSERT INTO courses (name, azotaClassId) VALUES (?, ?)'
    ).run(name || '', azotaClassId || null);
    const row = db.prepare('SELECT * FROM courses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, azotaClassId } = req.body;
    db.prepare(
      'UPDATE courses SET name = COALESCE(?, name), azotaClassId = COALESCE(?, azotaClassId) WHERE id = ?'
    ).run(name ?? undefined, azotaClassId ?? undefined, req.params.id);
    setLastEdit('courses', req.params.id);
    const row = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const courseId = req.params.id;
    const classIds = db.prepare('SELECT id FROM classes WHERE courseId = ?').all(courseId).map(c => c.id);

    const run = db.transaction(() => {
      // 1. Xóa mọi transfer history tham chiếu đến bất kỳ class nào của course (trước khi xóa students/classes)
      for (const classId of classIds) {
        db.prepare('DELETE FROM student_class_transfer_history WHERE classIdFrom = ? OR classIdTo = ?').run(classId, classId);
      }

      for (const classId of classIds) {
        // 2. Xóa bản ghi liên quan students
        const studentIds = db.prepare('SELECT id FROM students WHERE classId = ?').all(classId).map(s => s.id);
        for (const studentId of studentIds) {
          db.prepare('DELETE FROM attendance WHERE studentId = ?').run(studentId);
          db.prepare('DELETE FROM session_report_student WHERE studentId = ?').run(studentId);
          db.prepare('DELETE FROM session_report_files WHERE studentId = ?').run(studentId);
          db.prepare('DELETE FROM student_status_history WHERE studentId = ?').run(studentId);
          db.prepare('DELETE FROM student_class_transfer_history WHERE studentId = ?').run(studentId);
        }
        db.prepare('DELETE FROM students WHERE classId = ?').run(classId);

        // 3. Xóa sessions và bản ghi liên quan
        const sessionIds = db.prepare('SELECT id FROM sessions WHERE classId = ?').all(classId).map(s => s.id);
        for (const sessionId of sessionIds) {
          db.prepare('DELETE FROM attendance WHERE sessionId = ?').run(sessionId);
          db.prepare('DELETE FROM session_report_student WHERE sessionId = ?').run(sessionId);
          db.prepare('DELETE FROM session_report_files WHERE sessionId = ?').run(sessionId);
        }
        db.prepare('DELETE FROM sessions WHERE classId = ?').run(classId);

        // 4. Xóa schedule template và history
        db.prepare('DELETE FROM class_schedule_template_history WHERE classId = ?').run(classId);
        db.prepare('DELETE FROM class_schedule_template WHERE classId = ?').run(classId);
      }

      // 5. Xóa classes rồi mới xóa course
      db.prepare('DELETE FROM classes WHERE courseId = ?').run(courseId);
      const result = db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
      if (result.changes === 0) throw new Error('Not found');
    });

    run();
    res.status(204).send();
  } catch (e) {
    logError(e, 'DELETE /courses/:id');
    if (e.message === 'Not found') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
