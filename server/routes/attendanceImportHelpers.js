/**
 * Helpers for attendance bulk import: find/create sessions, match students.
 */

const VALID_VALUES = new Set(['X', 'B', 'M', 'P', '', '-']);

function parseThang(thang) {
  if (!thang || typeof thang !== 'string') return null;
  const parts = thang.trim().split(/[.\/]/);
  if (parts.length < 2) return null;
  const month = parseInt(parts[0], 10);
  const year = parseInt(parts[1], 10);
  if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return null;
  return { month, year };
}

function thangBuoiToNgayHoc(thang, buoi) {
  const p = parseThang(thang);
  if (!p || buoi == null) return null;
  const d = new Date(p.year, p.month - 1, 1);
  const addDays = (Number(buoi) || 1) - 1;
  d.setDate(d.getDate() + addDays * 7);
  return d.toISOString().slice(0, 10);
}

function findStudent(db, { maHV, hoTen, classId }) {
  const m = (maHV || '').trim();
  const h = (hoTen || '').trim();
  const normMaHV = m.replace(/\s*-\s*/g, '').toUpperCase();
  if (!m && !h) return null;

  if (m) {
    let byMaHV = db.prepare('SELECT * FROM students WHERE maHV = ?').get(m);
    if (byMaHV) return byMaHV;
    if (normMaHV) {
      const all = db.prepare('SELECT * FROM students').all();
      byMaHV = all.find(s => (s.maHV || '').replace(/\s*-\s*/g, '').toUpperCase() === normMaHV);
      if (byMaHV) return byMaHV;
    }
  }

  if (h && classId) {
    const byClass = db.prepare('SELECT * FROM students WHERE classId = ?').all(classId);
    const byHoTen = byClass.find(s =>
      (s.hoTen || '').trim() === h ||
      (s.hoTen || '').replace(/\s+/g, '') === h.replace(/\s+/g, '')
    );
    if (byHoTen) return byHoTen;
  }

  return null;
}

function findSession(db, classId, thang, buoi) {
  return db.prepare(
    'SELECT * FROM sessions WHERE classId = ? AND thang = ? AND buoi = ?'
  ).get(classId, thang, Number(buoi));
}

function createSession(db, classId, thang, buoi) {
  const ngayHoc = thangBuoiToNgayHoc(thang, buoi) || new Date().toISOString().slice(0, 10);
  const result = db.prepare(
    `INSERT INTO sessions (classId, ngayHoc, startTime, thang, buoi, noiDungHoc, sourceType, enableAttendance)
     VALUES (?, ?, '19:00', ?, ?, NULL, 'manual', 1)`
  ).run(classId, ngayHoc, thang, Number(buoi));
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);
}

function findOrCreateSession(db, classId, thang, buoi, createIfNotExists) {
  let session = findSession(db, classId, thang, buoi);
  if (!session && createIfNotExists) {
    session = createSession(db, classId, thang, buoi);
  }
  return session;
}

function normalizeValue(value) {
  const v = (value != null ? String(value).trim().toUpperCase() : '');
  if (v === '' || v === '-') return '';
  return VALID_VALUES.has(v) ? v : null;
}

module.exports = {
  findStudent,
  findSession,
  createSession,
  findOrCreateSession,
  normalizeValue,
};
