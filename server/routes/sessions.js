const express = require('express');
const router = express.Router();
const { db, setLastEdit } = require('../db');
const SEAT_ROWS = 4;
const SEAT_COLS = 7;

let reportColsCache = null;

function getReportCols() {
  if (reportColsCache) return reportColsCache;
  const cols = db.prepare('PRAGMA table_info(session_report_student)').all().map((c) => c.name);
  reportColsCache = {
    score: cols.includes('diem') ? 'diem' : (cols.includes('score') ? 'score' : null),
    comment: cols.includes('nhanXetGiangVien')
      ? 'nhanXetGiangVien'
      : (cols.includes('teacherComment') ? 'teacherComment' : (cols.includes('teacher_comment') ? 'teacher_comment' : null)),
  };
  return reportColsCache;
}

function parseMeta(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeFeedbackItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((it) => it && Number.isFinite(Number(it.studentId)))
    .map((it) => ({
      studentId: Number(it.studentId),
      score: it.score == null ? null : String(it.score).trim(),
      comment: it.comment == null ? null : String(it.comment).trim(),
      syncAttendanceNote: it.syncAttendanceNote !== false,
    }));
}

function upsertStudentFeedbackTx(sessionId, items) {
  const now = new Date().toISOString();
  const by = 'user';
  const cols = getReportCols();
  let inserted = 0;
  let updated = 0;
  let attendanceUpserts = 0;

  const tx = db.transaction((list) => {
    for (const it of list) {
      const scoreVal = it.score === '' ? null : it.score;
      const commentVal = it.comment === '' ? null : it.comment;
      const existing = db.prepare(
        'SELECT id FROM session_report_student WHERE sessionId = ? AND studentId = ?'
      ).get(sessionId, it.studentId);

      if (existing) {
        const sets = ['lastEditAt = ?', 'lastEditBy = ?'];
        const params = [now, by];
        if (cols.score) {
          sets.push(`${cols.score} = ?`);
          params.push(scoreVal);
        }
        if (cols.comment) {
          sets.push(`${cols.comment} = ?`);
          params.push(commentVal);
        }
        params.push(existing.id);
        db.prepare(`UPDATE session_report_student SET ${sets.join(', ')} WHERE id = ?`).run(...params);
        updated++;
      } else {
        const fields = ['sessionId', 'studentId', 'lastEditAt', 'lastEditBy'];
        const placeholders = ['?', '?', '?', '?'];
        const params = [sessionId, it.studentId, now, by];
        if (cols.score) {
          fields.push(cols.score);
          placeholders.push('?');
          params.push(scoreVal);
        }
        if (cols.comment) {
          fields.push(cols.comment);
          placeholders.push('?');
          params.push(commentVal);
        }
        db.prepare(
          `INSERT INTO session_report_student (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`
        ).run(...params);
        inserted++;
      }

      if (!it.syncAttendanceNote) continue;
      const existingAttendance = db.prepare(
        'SELECT id FROM attendance WHERE studentId = ? AND sessionId = ?'
      ).get(it.studentId, sessionId);
      if (existingAttendance) {
        db.prepare(
          'UPDATE attendance SET note = ?, lastEditAt = ?, lastEditBy = ? WHERE id = ?'
        ).run(commentVal, now, by, existingAttendance.id);
      } else if (commentVal) {
        const session = db.prepare('SELECT ngayHoc FROM sessions WHERE id = ?').get(sessionId);
        db.prepare(
          'INSERT INTO attendance (studentId, sessionId, ngayDiemDanh, value, note, lastEditAt, lastEditBy) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(it.studentId, sessionId, session?.ngayHoc || null, null, commentVal, now, by);
      }
      attendanceUpserts++;
    }
  });
  tx(items);
  setLastEdit('sessions', sessionId);
  return { inserted, updated, attendanceUpserts };
}

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

    /** Trang Ca học: mỗi dòng = 1 ca, phân trang theo dòng (không gom tháng-buổi). Điểm danh vẫn dùng API không flat. */
    if (req.query.flat === '1') {
      const flatSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
      const flatOffset = (page - 1) * flatSize;
      const countRow = db.prepare(`SELECT COUNT(*) as n FROM sessions s WHERE ${where}`).get(...baseParams);
      const total = countRow?.n ?? 0;
      res.set('X-Total-Count', String(total));
      const rows = db
        .prepare(
          `SELECT s.*, c.name as className FROM sessions s
           LEFT JOIN classes c ON s.classId = c.id
           WHERE ${where}
           ORDER BY s.ngayHoc DESC, s.startTime DESC, s.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...baseParams, flatSize, flatOffset);
      return res.json(rows);
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

    // Paginate by session groups (thang-buoi), unless allGroups=1 (Điểm danh: mọi cột)
    const countSQL = `
      SELECT COUNT(*) as n FROM (
        SELECT thang, buoi FROM sessions s WHERE ${where} GROUP BY thang, buoi
      )
    `;
    const total = db.prepare(countSQL).get(...baseParams)?.n ?? 0;
    res.set('X-Total-Count', String(total));

    const allGroups = req.query.allGroups === '1';
    const groupSQL = `
      SELECT thang, buoi, MIN(ngayHoc) as min_ngay
      FROM sessions s
      WHERE ${where.replace(/s\./g, 's.')}
      GROUP BY thang, buoi
      ORDER BY min_ngay
      ${allGroups ? '' : 'LIMIT ? OFFSET ?'}
    `;
    const groupParams = allGroups ? baseParams : [...baseParams, pageSize, offset];
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

router.get('/:id/seat-map', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = db.prepare(
      'SELECT s.*, c.name as className FROM sessions s LEFT JOIN classes c ON s.classId = c.id WHERE s.id = ?'
    ).get(sessionId);
    if (!session) return res.status(404).json({ error: 'Not found' });

    const students = db.prepare(
      'SELECT * FROM students WHERE classId = ? ORDER BY maHV'
    ).all(session.classId);
    const seats = db.prepare(
      'SELECT seatRow, seatCol, studentId, seatLabel, meta, lastEditAt FROM session_seat_map WHERE sessionId = ?'
    ).all(sessionId).map((row) => ({ ...row, meta: parseMeta(row.meta) }));

    const cols = getReportCols();
    const scoreExpr = cols.score ? cols.score : 'NULL';
    const commentExpr = cols.comment ? cols.comment : 'NULL';
    const reports = db.prepare(
      `SELECT studentId, ${scoreExpr} as score, ${commentExpr} as comment, lastEditAt
       FROM session_report_student WHERE sessionId = ?`
    ).all(sessionId);

    return res.json({
      session,
      grid: { rows: SEAT_ROWS, cols: SEAT_COLS },
      students,
      seats,
      reports,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put('/:id/seat-map', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Not found' });

    const seats = Array.isArray(req.body?.seats) ? req.body.seats : [];
    const seenSeat = new Set();
    const seenStudent = new Set();
    const normalized = [];
    for (const it of seats) {
      const seatRow = Number(it?.seatRow);
      const seatCol = Number(it?.seatCol);
      if (!Number.isInteger(seatRow) || !Number.isInteger(seatCol)) continue;
      if (seatRow < 0 || seatRow >= SEAT_ROWS || seatCol < 0 || seatCol >= SEAT_COLS) {
        return res.status(400).json({ error: 'Vị trí ghế không hợp lệ' });
      }
      const seatKey = `${seatRow}-${seatCol}`;
      if (seenSeat.has(seatKey)) return res.status(400).json({ error: 'Ghế bị trùng trong payload' });
      seenSeat.add(seatKey);

      const studentId = it?.studentId == null || it?.studentId === '' ? null : Number(it.studentId);
      if (studentId != null) {
        if (!Number.isFinite(studentId)) return res.status(400).json({ error: 'studentId không hợp lệ' });
        if (seenStudent.has(studentId)) return res.status(400).json({ error: 'Một học sinh được gán nhiều ghế' });
        seenStudent.add(studentId);
      }
      normalized.push({
        seatRow,
        seatCol,
        studentId,
        seatLabel: it?.seatLabel == null ? null : String(it.seatLabel),
        meta: it?.meta == null ? null : JSON.stringify(it.meta),
      });
    }

    const now = new Date().toISOString();
    const by = 'user';
    const tx = db.transaction((items) => {
      db.prepare('DELETE FROM session_seat_map WHERE sessionId = ?').run(sessionId);
      const insertStmt = db.prepare(
        'INSERT INTO session_seat_map (sessionId, seatRow, seatCol, studentId, seatLabel, meta, lastEditAt, lastEditBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const item of items) {
        if (item.studentId == null) continue;
        insertStmt.run(sessionId, item.seatRow, item.seatCol, item.studentId, item.seatLabel, item.meta, now, by);
      }
    });
    tx(normalized);
    setLastEdit('sessions', sessionId);
    return res.json({ ok: true, count: normalized.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put('/:id/student-reports', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Not found' });
    const items = normalizeFeedbackItems(req.body?.items);
    const result = upsertStudentFeedbackTx(sessionId, items);
    return res.json({ ok: true, ...result, total: items.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/student-reports/:studentId', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (!Number.isFinite(studentId)) return res.status(400).json({ error: 'studentId không hợp lệ' });

    const item = normalizeFeedbackItems([{ ...req.body, studentId }])[0];
    if (!item) return res.status(400).json({ error: 'Payload không hợp lệ' });
    const result = upsertStudentFeedbackTx(sessionId, [item]);
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
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
    db.prepare('DELETE FROM session_seat_map WHERE sessionId = ?').run(req.params.id);
    
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
