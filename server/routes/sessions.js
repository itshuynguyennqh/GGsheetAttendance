const express = require('express');
const router = express.Router();
const { db, setLastEdit } = require('../db');

function parseDateYMD(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function addMonths(d, months) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}
function toYMD(d) {
  return d.toISOString().slice(0, 10);
}

router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 12));
    const offset = (page - 1) * pageSize;

    let where = '1=1';
    const baseParams = [];
    if (req.query.classId) {
      where += ' AND s.classId = ?';
      baseParams.push(req.query.classId);
    }
    if (req.query.ngayHoc) {
      where += ' AND s.ngayHoc = ?';
      baseParams.push(req.query.ngayHoc);
    }
    let gte = req.query.ngayHocGte;
    if (req.query.ngayHocLte && !gte) {
      const end = parseDateYMD(req.query.ngayHocLte);
      if (end) {
        gte = toYMD(addMonths(end, -6));
      }
    }
    if (gte) {
      where += ' AND s.ngayHoc >= ?';
      baseParams.push(gte);
    }
    if (req.query.ngayHocLte) {
      where += ' AND s.ngayHoc <= ?';
      baseParams.push(req.query.ngayHocLte);
    }
    if (req.query.enableAttendance === '1') {
      where += ' AND s.enableAttendance = 1';
    }

    // Paginate by session groups (thang-buoi)
    const groupSQL = `
      SELECT thang, buoi, MIN(ngayHoc) as min_ngay
      FROM sessions s
      WHERE ${where.replace(/s\./g, 's.')}
      GROUP BY thang, buoi
      ORDER BY min_ngay
      LIMIT ? OFFSET ?
    `;
    const countSQL = `
      SELECT COUNT(*) as n FROM (
        SELECT thang, buoi FROM sessions s WHERE ${where} GROUP BY thang, buoi
      )
    `;
    const total = db.prepare(countSQL).get(...baseParams)?.n ?? 0;
    res.set('X-Total-Count', String(total));

    const groupParams = [...baseParams, pageSize, offset];
    const groups = db.prepare(groupSQL).all(...groupParams);
    if (groups.length === 0) {
      return res.json([]);
    }

    const groupConditions = groups.map(() => '(s.thang = ? AND s.buoi = ?)').join(' OR ');
    const groupValues = groups.flatMap(g => [g.thang, g.buoi]);
    const sql = `
      SELECT s.*, c.name as className FROM sessions s
      LEFT JOIN classes c ON s.classId = c.id
      WHERE (${groupConditions}) AND ${where}
      ORDER BY s.ngayHoc, s.startTime
    `;
    const rows = db.prepare(sql).all(...groupValues, ...baseParams);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(
      'SELECT s.*, c.name as className FROM sessions s LEFT JOIN classes c ON s.classId = c.id WHERE s.id = ?'
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { classId, ngayHoc, startTime, noiDungHoc, enableAttendance } = req.body;
    const result = db.prepare(
      'INSERT INTO sessions (classId, ngayHoc, startTime, noiDungHoc, sourceType, enableAttendance) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(classId, ngayHoc || new Date().toISOString().slice(0, 10), startTime || '19:00', noiDungHoc || null, 'manual', enableAttendance !== 0 ? 1 : 0);
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { ngayHoc, startTime, noiDungHoc, enableAttendance } = req.body;
    db.prepare(
      'UPDATE sessions SET ngayHoc = COALESCE(?, ngayHoc), startTime = COALESCE(?, startTime), noiDungHoc = COALESCE(?, noiDungHoc), enableAttendance = COALESCE(?, enableAttendance) WHERE id = ?'
    ).run(ngayHoc ?? undefined, startTime ?? undefined, noiDungHoc ?? undefined, enableAttendance ?? undefined, req.params.id);
    setLastEdit('sessions', req.params.id);
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    // Xóa các bản ghi liên quan trước để tránh lỗi FK constraint
    db.prepare('DELETE FROM attendance WHERE sessionId = ?').run(req.params.id);
    db.prepare('DELETE FROM session_report_student WHERE sessionId = ?').run(req.params.id);
    db.prepare('DELETE FROM session_report_files WHERE sessionId = ?').run(req.params.id);
    
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
