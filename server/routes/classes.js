const express = require('express');
const router = express.Router();
const { db, setLastEdit } = require('../db');
const { normalizeThang } = require('./attendanceImportHelpers');

router.get('/timestamp', (req, res) => {
  try {
    const { courseId } = req.query;
    
    // Get max lastEditAt from classes table
    let sql = 'SELECT MAX(lastEditAt) as maxTimestamp FROM classes';
    const params = [];
    
    if (courseId) {
      sql += ' WHERE courseId = ?';
      params.push(courseId);
    }
    
    const result = db.prepare(sql).get(...params);
    res.json({ timestamp: result?.maxTimestamp || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', (req, res) => {
  try {
    let sql = 'SELECT c.*, co.name as courseName FROM classes c LEFT JOIN courses co ON c.courseId = co.id WHERE 1=1';
    const params = [];
    if (req.query.courseId) {
      sql += ' AND c.courseId = ?';
      params.push(req.query.courseId);
    }
    sql += ' ORDER BY c.id';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(
      'SELECT c.*, co.name as courseName FROM classes c LEFT JOIN courses co ON c.courseId = co.id WHERE c.id = ?'
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { courseId, name, scheduleConfig } = req.body;
    const result = db.prepare(
      'INSERT INTO classes (courseId, name, scheduleConfig) VALUES (?, ?, ?)'
    ).run(courseId, name || '', scheduleConfig || null);
    const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { courseId, name, scheduleConfig } = req.body;
    const stmt = db.prepare(
      'UPDATE classes SET courseId = COALESCE(?, courseId), name = COALESCE(?, name), scheduleConfig = COALESCE(?, scheduleConfig) WHERE id = ?'
    );
    stmt.run(courseId ?? undefined, name ?? undefined, scheduleConfig ?? undefined, req.params.id);
    setLastEdit('classes', req.params.id);
    const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    // Xóa các bản ghi liên quan trước để tránh lỗi FK constraint
    // Xóa students và các bản ghi liên quan của students
    const studentIds = db.prepare('SELECT id FROM students WHERE classId = ?').all(req.params.id).map(s => s.id);
    for (const studentId of studentIds) {
      db.prepare('DELETE FROM attendance WHERE studentId = ?').run(studentId);
      db.prepare('DELETE FROM session_report_student WHERE studentId = ?').run(studentId);
      db.prepare('DELETE FROM session_report_files WHERE studentId = ?').run(studentId);
      db.prepare('DELETE FROM student_status_history WHERE studentId = ?').run(studentId);
      db.prepare('DELETE FROM student_class_transfer_history WHERE studentId = ?').run(studentId);
    }
    db.prepare('DELETE FROM students WHERE classId = ?').run(req.params.id);
    
    // Xóa sessions và các bản ghi liên quan của sessions
    const sessionIds = db.prepare('SELECT id FROM sessions WHERE classId = ?').all(req.params.id).map(s => s.id);
    for (const sessionId of sessionIds) {
      db.prepare('DELETE FROM attendance WHERE sessionId = ?').run(sessionId);
      db.prepare('DELETE FROM session_report_student WHERE sessionId = ?').run(sessionId);
      db.prepare('DELETE FROM session_report_files WHERE sessionId = ?').run(sessionId);
    }
    db.prepare('DELETE FROM sessions WHERE classId = ?').run(req.params.id);
    
    // Xóa schedule template và history
    db.prepare('DELETE FROM class_schedule_template_history WHERE classId = ?').run(req.params.id);
    db.prepare('DELETE FROM class_schedule_template WHERE classId = ?').run(req.params.id);
    
    // Xóa student_class_transfer_history có reference đến class này
    db.prepare('DELETE FROM student_class_transfer_history WHERE classIdFrom = ? OR classIdTo = ?').run(req.params.id, req.params.id);
    
    const result = db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Schedule template
router.get('/:id/schedule-template', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM class_schedule_template WHERE classId = ? ORDER BY dayOfWeek, startTime'
    ).all(req.params.id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function logScheduleHistory(classId, templateId, action, data, note) {
  db.prepare(
    'INSERT INTO class_schedule_template_history (classId, templateId, action, dayOfWeek, startTime, noiDungHoc, isActive, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(classId, templateId, action, data?.dayOfWeek ?? null, data?.startTime ?? null, data?.noiDungHoc ?? null, data?.isActive ?? null, note || null);
}

router.get('/:id/schedule-template-history', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM class_schedule_template_history WHERE classId = ? ORDER BY createdAt DESC'
    ).all(req.params.id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/schedule-template', (req, res) => {
  try {
    const { dayOfWeek, startTime, noiDungHoc, isActive } = req.body;
    const result = db.prepare(
      'INSERT INTO class_schedule_template (classId, dayOfWeek, startTime, noiDungHoc, isActive) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, dayOfWeek ?? 1, startTime || '19:00', noiDungHoc || null, isActive ?? 1);
    setLastEdit('class_schedule_template', result.lastInsertRowid);
    logScheduleHistory(req.params.id, result.lastInsertRowid, 'create', { dayOfWeek: dayOfWeek ?? 1, startTime: startTime || '19:00', noiDungHoc, isActive: isActive ?? 1 });
    const row = db.prepare('SELECT * FROM class_schedule_template WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/schedule-template/:tid', (req, res) => {
  try {
    const old = db.prepare('SELECT * FROM class_schedule_template WHERE id = ? AND classId = ?').get(req.params.tid, req.params.id);
    if (!old) return res.status(404).json({ error: 'Not found' });
    const { dayOfWeek, startTime, noiDungHoc, isActive } = req.body;
    db.prepare(
      'UPDATE class_schedule_template SET dayOfWeek = COALESCE(?, dayOfWeek), startTime = COALESCE(?, startTime), noiDungHoc = COALESCE(?, noiDungHoc), isActive = COALESCE(?, isActive) WHERE id = ? AND classId = ?'
    ).run(dayOfWeek ?? undefined, startTime ?? undefined, noiDungHoc ?? undefined, isActive ?? undefined, req.params.tid, req.params.id);
    setLastEdit('class_schedule_template', req.params.tid);
    logScheduleHistory(req.params.id, parseInt(req.params.tid), 'update', req.body);
    const row = db.prepare('SELECT * FROM class_schedule_template WHERE id = ?').get(req.params.tid);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/schedule-template/:tid', (req, res) => {
  try {
    const old = db.prepare('SELECT * FROM class_schedule_template WHERE id = ? AND classId = ?').get(req.params.tid, req.params.id);
    if (!old) return res.status(404).json({ error: 'Not found' });
    logScheduleHistory(req.params.id, parseInt(req.params.tid), 'delete', old);
    db.prepare('DELETE FROM class_schedule_template WHERE id = ? AND classId = ?').run(req.params.tid, req.params.id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generate sessions from template
router.post('/:id/generate-sessions', (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const classId = parseInt(req.params.id, 10);
    const classRow = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!classRow) return res.status(404).json({ error: 'Class not found' });

    let scheduleConfig = {};
    if (classRow.scheduleConfig) {
      try { scheduleConfig = JSON.parse(classRow.scheduleConfig); } catch (_) {}
    }
    const defaultEnableAttendance = scheduleConfig.defaultEnableAttendance !== false ? 1 : 0;

    const templates = db.prepare(
      'SELECT * FROM class_schedule_template WHERE classId = ? AND isActive = 1'
    ).all(classId);
    if (templates.length === 0) return res.json({ created: 0, message: 'No active schedule template' });

    const start = new Date(startDate || Date.now());
    const end = new Date(endDate || start);
    const created = [];
    const dayNames = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const jsDay = d.getDay();
      const planDay = jsDay === 0 ? 7 : jsDay;
      for (const t of templates) {
        if (t.dayOfWeek !== planDay) continue;
        const ngayHoc = d.toISOString().slice(0, 10);
        const existing = db.prepare(
          'SELECT id FROM sessions WHERE classId = ? AND ngayHoc = ? AND startTime = ?'
        ).get(classId, ngayHoc, t.startTime || '19:00');
        if (existing) continue;

        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const thang = normalizeThang(`${month}.${year}`);
        const buoiResult = db.prepare(
          'SELECT MAX(buoi) as maxBuoi FROM sessions WHERE classId = ? AND thang = ?'
        ).get(classId, thang);
        const buoi = (buoiResult?.maxBuoi ?? 0) + 1;

        const result = db.prepare(
          'INSERT INTO sessions (classId, ngayHoc, startTime, thang, buoi, noiDungHoc, sourceType, enableAttendance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(classId, ngayHoc, t.startTime || '19:00', thang, buoi, t.noiDungHoc || null, 'template', defaultEnableAttendance);
        created.push(result.lastInsertRowid);
      }
    }

    res.json({ created: created.length, ids: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
