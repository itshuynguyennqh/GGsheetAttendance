const express = require('express');
const router = express.Router();
const { db, setLastEdit, logTiming } = require('../db');
const {
  findStudent,
  findOrCreateSession,
  normalizeValue,
  normalizeThang,
  formatThangBuoiLabel,
} = require('./attendanceImportHelpers');
const { mergeCrossClassStudents } = require('../lib/mergeAttendanceGuests');

/** Get max lastEditAt timestamp for cache validation (classId/ngayHocLte optional) */
function getMaxTimestamp(classId, ngayHocLte) {
  if (!classId) {
    const result = db.prepare(`
      SELECT MAX(ts) as maxTimestamp FROM (
        SELECT MAX(lastEditAt) as ts FROM attendance
        UNION ALL SELECT MAX(lastEditAt) as ts FROM sessions WHERE enableAttendance = 1
        UNION ALL SELECT MAX(lastEditAt) as ts FROM students
        UNION ALL SELECT MAX(lastEditAt) as ts FROM classes
      )
    `).get();
    return result?.maxTimestamp || null;
  }
  if (ngayHocLte) {
    const result = db.prepare(`
      SELECT MAX(ts) as maxTimestamp FROM (
        SELECT MAX(lastEditAt) as ts FROM attendance WHERE sessionId IN (SELECT id FROM sessions WHERE classId = ? AND ngayHoc <= ?)
        UNION ALL SELECT MAX(lastEditAt) as ts FROM sessions WHERE classId = ? AND enableAttendance = 1 AND ngayHoc <= ?
        UNION ALL SELECT MAX(lastEditAt) as ts FROM students WHERE classId = ?
        UNION ALL SELECT MAX(lastEditAt) as ts FROM classes WHERE id = ?
      )
    `).get(classId, ngayHocLte, classId, ngayHocLte, classId, classId);
    return result?.maxTimestamp || null;
  }
  const result = db.prepare(`
    SELECT MAX(ts) as maxTimestamp FROM (
      SELECT MAX(lastEditAt) as ts FROM attendance WHERE sessionId IN (SELECT id FROM sessions WHERE classId = ?)
      UNION ALL SELECT MAX(lastEditAt) as ts FROM sessions WHERE classId = ? AND enableAttendance = 1
      UNION ALL SELECT MAX(lastEditAt) as ts FROM students WHERE classId = ?
      UNION ALL SELECT MAX(lastEditAt) as ts FROM classes WHERE id = ?
    )
  `).get(classId, classId, classId, classId);
  return result?.maxTimestamp || null;
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
    const { sessionId, classId, thang, buoi, ngayHocLte, ngayHocGte, page, pageSize, allGroups, includeTimestamp } = req.query;
    let sessions = [];
    let students = [];
    let totalGroups = null;
    let reqStart;
    let stepMs = null;

    if (sessionId) {
      sessions = db.prepare('SELECT * FROM sessions WHERE id = ?').all(sessionId);
      if (sessions.length === 0) return res.json({ sessions: [], students: [], attendance: [] });
      const s = sessions[0];
      students = db.prepare('SELECT * FROM students WHERE classId = ? ORDER BY maHV').all(s.classId);
      students = mergeCrossClassStudents([s.id], s.classId, students);
    } else if (classId) {
      reqStart = Date.now();
      const pg = Math.max(1, parseInt(page, 10) || 1);
      const ps = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 12));
      const offset = (pg - 1) * ps;
      const loadAllGroups = allGroups === '1';
      stepMs = {};

      let baseSql = 'SELECT * FROM sessions WHERE classId = ? AND enableAttendance = 1';
      const baseParams = [classId];
      let gte = ngayHocGte;
      if (ngayHocLte && !gte) {
        const end = parseDateYMD(ngayHocLte);
        if (end) {
          gte = toYMD(addMonths(end, -6));
        }
      }
      if (gte) {
        baseSql += ' AND ngayHoc >= ?';
        baseParams.push(gte);
      }
      if (ngayHocLte) {
        baseSql += ' AND ngayHoc <= ?';
        baseParams.push(ngayHocLte);
      }
      if (thang) {
        baseSql += ' AND thang = ?';
        baseParams.push(normalizeThang(thang) || thang);
      }
      if (buoi) {
        baseSql += ' AND buoi = ?';
        baseParams.push(buoi);
      }

      const where = baseSql.replace('SELECT * FROM sessions WHERE ', '');
      let t0 = Date.now();
      const groupSQL = `
        SELECT thang, buoi, MIN(ngayHoc) as min_ngay FROM sessions WHERE ${where}
        GROUP BY thang, buoi ORDER BY min_ngay
        ${loadAllGroups ? '' : 'LIMIT ? OFFSET ?'}
      `;
      let groups;
      try {
        groups = loadAllGroups
          ? db.prepare(groupSQL).all(...baseParams)
          : db.prepare(groupSQL).all(...baseParams, ps, offset);
      } catch (e) {
        throw new Error(`[step:groups] ${e.message}`);
      }
      stepMs.groups = Date.now() - t0;
      logTiming('groups query', stepMs.groups, { classId, groupCount: groups.length });

      if (groups.length === 0) {
        const rosterOnly = db.prepare('SELECT * FROM students WHERE classId = ? ORDER BY maHV').all(classId);
        const payload = { sessions: [], students: mergeCrossClassStudents([], classId, rosterOnly), attendance: {} };
        if (classId) payload.timestamp = getMaxTimestamp(classId, ngayHocLte);
        payload.totalGroups = 0;
        return res.json(payload);
      }

      t0 = Date.now();
      const groupConds = groups.map(g => {
        const t = g.thang === null ? 'thang IS NULL' : 'thang = ?';
        const b = g.buoi === null ? 'buoi IS NULL' : 'buoi = ?';
        return `(${t} AND ${b})`;
      }).join(' OR ');
      const groupVals = groups.flatMap(g => {
        const vals = [];
        if (g.thang !== null) vals.push(g.thang);
        if (g.buoi !== null) vals.push(g.buoi);
        return vals;
      });
      const sessionSQL = `SELECT * FROM sessions WHERE (${groupConds}) AND classId = ? AND enableAttendance = 1` +
        (gte ? ' AND ngayHoc >= ?' : '') + (ngayHocLte ? ' AND ngayHoc <= ?' : '') +
        ' ORDER BY ngayHoc, startTime';
      const sessionParams = [...groupVals, classId];
      if (gte) sessionParams.push(gte);
      if (ngayHocLte) sessionParams.push(ngayHocLte);
      try {
        sessions = db.prepare(sessionSQL).all(...sessionParams);
      } catch (e) {
        throw new Error(`[step:sessions] ${e.message}`);
      }
      stepMs.sessions = Date.now() - t0;
      logTiming('sessions query', stepMs.sessions, { classId, sessionCount: sessions.length });

      t0 = Date.now();
      let countGrp;
      try {
        countGrp = db.prepare(`
          SELECT COUNT(*) AS cnt FROM (SELECT thang, buoi FROM sessions WHERE ${where} GROUP BY thang, buoi)
        `).get(...baseParams);
      } catch (e) {
        throw new Error(`[step:count] ${e.message}`);
      }
      stepMs.count = Date.now() - t0;
      totalGroups = countGrp?.cnt ?? 0;
      students = db.prepare('SELECT * FROM students WHERE classId = ? ORDER BY maHV').all(classId);
      students = mergeCrossClassStudents(sessions.map((x) => x.id), classId, students);
      res.set('X-Total-Groups', String(totalGroups));
      logTiming('count + students', stepMs.count);
    } else {
      return res.json({ sessions: [], students: [], attendance: [] });
    }

    let t0 = Date.now();
    const sessionIds = sessions.map(s => s.id);
    let attendance = [];
    if (sessionIds.length > 0) {
      try {
        attendance = db.prepare(
          'SELECT * FROM attendance WHERE sessionId IN (' + sessionIds.map(() => '?').join(',') + ')'
        ).all(...sessionIds);
      } catch (e) {
        throw new Error(`[step:attendance] ${e.message}`);
      }
    }
    const attendanceMs = Date.now() - t0;
    if (stepMs) stepMs.attendance = attendanceMs;
    logTiming('attendance query', attendanceMs, { sessionCount: sessionIds.length, rowCount: attendance.length });

    t0 = Date.now();
    const byKey = {};
    attendance.forEach(a => {
      byKey[`${a.studentId}-${a.sessionId}`] = a;
    });

    const payload = { sessions, students, attendance: byKey };
    if (classId) {
      t0 = Date.now();
      try {
        if (includeTimestamp !== '0' && includeTimestamp !== 'false') {
          payload.timestamp = getMaxTimestamp(classId, ngayHocLte);
        } else {
          const maxTs = attendance.reduce((max, a) => {
            const t = a?.lastEditAt;
            return t && (!max || t > max) ? t : max;
          }, null);
          payload.timestamp = maxTs;
        }
      } catch (e) {
        throw new Error(`[step:timestamp] ${e.message}`);
      }
      logTiming('timestamp', Date.now() - t0);
    }
    if (classId && totalGroups !== null) {
      payload.totalGroups = totalGroups;
    }
    if (classId && typeof reqStart !== 'undefined') {
      const totalMs = Date.now() - reqStart;
      logTiming('GET /attendance total', totalMs, { classId });
      const debugTiming = process.env.DEBUG_ATTENDANCE_TIMING === '1' || process.env.DEBUG_API === '1' || process.env.DEBUG === '1';
      if (totalMs > 2000) {
        console.warn(`[attendance] GET slow: classId=${classId} took ${totalMs}ms`, stepMs || {});
      } else if (debugTiming && stepMs && Object.keys(stepMs).length) {
        console.log(`[attendance] GET /attendance steps`, stepMs);
      }
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const now = new Date().toISOString();
    const by = 'user';

    for (const it of items) {
      const { studentId, sessionId, ngayDiemDanh, value, note } = it;
      if (!studentId || !sessionId) continue;

      /** Ghi Ä‘Ã¨ value/note (ká»ƒ cáº£ NULL) â€” trÃ¡nh COALESCE(?, value) khiáº¿n xÃ³a Ã´ khÃ´ng cÃ³ tÃ¡c dá»¥ng */
      let val = null;
      if (value != null && String(value).trim() !== '') {
        const n = normalizeValue(value);
        val = n && n !== '' ? n : null;
      }
      const noteVal = note == null || String(note).trim() === '' ? null : String(note);

      const existing = db.prepare(
        'SELECT id FROM attendance WHERE studentId = ? AND sessionId = ?'
      ).get(studentId, sessionId);

      if (existing) {
        db.prepare(
          'UPDATE attendance SET ngayDiemDanh = COALESCE(?, ngayDiemDanh), value = ?, note = ?, lastEditAt = ?, lastEditBy = ? WHERE id = ?'
        ).run(ngayDiemDanh ?? null, val, noteVal, now, by, existing.id);
      } else {
        if (val == null && !noteVal) continue;
        db.prepare(
          'INSERT INTO attendance (studentId, sessionId, ngayDiemDanh, value, note, lastEditAt, lastEditBy) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(studentId, sessionId, ngayDiemDanh || null, val, noteVal, now, by);
      }
    }

    res.json({ ok: true, count: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Validate import (no DB write). Returns preview + summary + errors.
router.post('/validate-import', (req, res) => {
  try {
    const { attendance: items = [], options = {} } = req.body;
    const createSessionsIfNotExists = !!options.createSessionsIfNotExists;
    const updateExisting = options.updateExisting !== false;

    const preview = [];
    const errors = [];
    let validRows = 0;
    let invalidRows = 0;
    let totalRecords = 0;
    let newRecords = 0;
    let updateRecords = 0;
    let errorRecords = 0;

    const classes = db.prepare('SELECT id, name FROM classes').all();
    const classMap = new Map(classes.map(c => [c.id, c]));

    for (let rowIndex = 0; rowIndex < items.length; rowIndex++) {
      const item = items[rowIndex];
      const { maHV, hoTen, classId, records = [] } = item;
      const rowErrors = [];
      const rowWarnings = [];

      const student = findStudent(db, { maHV, hoTen, classId });
      if (!student) rowErrors.push('KhÃ´ng tÃ¬m tháº¥y há»c sinh');

      const resolvedClassId = student ? student.classId : (classId || null);
      const recordDetails = [];

      for (const rec of records) {
        const { thang, buoi, value, note } = rec;
        const normalizedValue = normalizeValue(value);
        if (normalizedValue === null && value !== '' && value != null) {
          rowErrors.push(`GiÃ¡ trá»‹ Ä‘iá»ƒm danh khÃ´ng há»£p lá»‡: "${value}" (thang ${thang}, buoi ${buoi})`);
          errorRecords++;
        }

        const session = student ? findOrCreateSession(db, resolvedClassId, thang, buoi, false) : null;
        if (student && !session) {
          if (createSessionsIfNotExists) {
            rowWarnings.push(`Session chÆ°a cÃ³ (sáº½ táº¡o khi import): ${thang}-B${buoi}`);
          } else {
            rowErrors.push(`Session khÃ´ng tá»“n táº¡i: ${formatThangBuoiLabel(thang, buoi)}`);
            errorRecords++;
          }
        }

        let existingAttendance = null;
        if (student && session) {
          existingAttendance = db.prepare(
            'SELECT id, value FROM attendance WHERE studentId = ? AND sessionId = ?'
          ).get(student.id, session.id);
          totalRecords++;
          if (existingAttendance) {
            if (updateExisting) updateRecords++;
            else rowWarnings.push(`ÄÃ£ cÃ³ Ä‘iá»ƒm danh (sáº½ update): ${formatThangBuoiLabel(thang, buoi)}`);
          } else newRecords++;
        }

        recordDetails.push({
          thang,
          buoi,
          value: normalizedValue !== null ? normalizedValue : (value != null ? String(value).trim() : ''),
          note: note || '',
          session: session ? { id: session.id, ngayHoc: session.ngayHoc, exists: true } : null,
          attendance: existingAttendance ? { id: existingAttendance.id, exists: true, willUpdate: updateExisting } : null,
        });
      }

      if (rowErrors.length > 0) invalidRows++; else validRows++;

      preview.push({
        rowIndex: rowIndex + 1,
        maHV: maHV || '',
        hoTen: hoTen || '',
        student: student ? { id: student.id, maHV: student.maHV, hoTen: student.hoTen, classId: student.classId } : null,
        className: student && classMap.get(student.classId) ? classMap.get(student.classId).name : null,
        records: recordDetails,
        warnings: rowWarnings,
        errors: rowErrors,
      });

      if (rowErrors.length > 0) {
        errors.push({ rowIndex: rowIndex + 1, maHV: maHV || '', hoTen: hoTen || '', error: rowErrors[0] });
      }
    }

    res.json({
      valid: errors.length === 0,
      preview,
      summary: {
        totalRows: items.length,
        validRows,
        invalidRows,
        totalRecords,
        newRecords,
        updateRecords,
        errorRecords,
      },
      errors,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk import attendance (writes to DB).
router.post('/bulk-import', (req, res) => {
  try {
    const { attendance: items = [], options = {} } = req.body;
    const createSessionsIfNotExists = !!options.createSessionsIfNotExists;
    const updateExisting = options.updateExisting !== false;

    const now = new Date().toISOString();
    const by = 'user';
    const success = [];
    const errors = [];
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { maHV, hoTen, classId, records = [] } = item;

      const student = findStudent(db, { maHV, hoTen, classId });
      if (!student) {
        errors.push({ rowIndex: i + 1, maHV: maHV || '', hoTen: hoTen || '', error: 'KhÃ´ng tÃ¬m tháº¥y há»c sinh' });
        continue;
      }

      const resolvedClassId = student.classId;

      for (const rec of records) {
        const { thang, buoi, value, note } = rec;
        const normalizedValue = normalizeValue(value);
        if (normalizedValue === null && value !== '' && value != null) {
          errors.push({ rowIndex: i + 1, maHV, thang, buoi, error: `GiÃ¡ trá»‹ khÃ´ng há»£p lá»‡: "${value}"` });
          continue;
        }

        const session = findOrCreateSession(db, resolvedClassId, thang, buoi, createSessionsIfNotExists);
        if (!session) {
          errors.push({ rowIndex: i + 1, maHV, thang, buoi, error: 'Session khÃ´ng tá»“n táº¡i' });
          continue;
        }

        const val = normalizedValue !== null ? normalizedValue : '';
        const existing = db.prepare(
          'SELECT id FROM attendance WHERE studentId = ? AND sessionId = ?'
        ).get(student.id, session.id);

        try {
          if (existing) {
            if (updateExisting) {
              db.prepare(
                'UPDATE attendance SET ngayDiemDanh = COALESCE(?, ngayDiemDanh), value = COALESCE(?, value), note = COALESCE(?, note), lastEditAt = ?, lastEditBy = ? WHERE id = ?'
              ).run(session.ngayHoc, val || null, note || null, now, by, existing.id);
              updated++;
            }
          } else {
            db.prepare(
              'INSERT INTO attendance (studentId, sessionId, ngayDiemDanh, value, note, lastEditAt, lastEditBy) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(student.id, session.id, session.ngayHoc || null, val || null, note || null, now, by);
            inserted++;
          }
          success.push({ maHV: student.maHV, thang, buoi, status: existing ? 'updated' : 'inserted' });
        } catch (err) {
          errors.push({ rowIndex: i + 1, maHV, thang, buoi, error: err.message });
        }
      }
    }

    res.json({
      success,
      errors,
      summary: { total: success.length + errors.length, inserted, updated, errors: errors.length },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint to get max lastEditAt timestamp for cache validation
router.get('/timestamp', (req, res) => {
  try {
    const { classId, ngayHocLte } = req.query;
    const timestamp = getMaxTimestamp(classId, ngayHocLte);
    res.json({ timestamp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
