const { db } = require('../db');
const { computeVisitStreakForHostClass } = require('./classVisitStreak');

function parseMeta(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function buildSeatMapPayload(sessionId, session, SEAT_ROWS, SEAT_COLS) {
  const hostClassId = session.classId;
  const layoutConfig = db.prepare(
    'SELECT rows, cols, disabledSeats FROM class_layout_config WHERE classId = ?'
  ).get(session.classId);
  const grid = layoutConfig
    ? { rows: layoutConfig.rows, cols: layoutConfig.cols, disabledSeats: JSON.parse(layoutConfig.disabledSeats || '[]') }
    : { rows: SEAT_ROWS, cols: SEAT_COLS, disabledSeats: [] };

  const roster = db.prepare(
    `SELECT s.*, c.name as className FROM students s
     LEFT JOIN classes c ON s.classId = c.id
     WHERE s.classId = ? ORDER BY s.maHV`
  ).all(hostClassId);
  const rosterIds = new Set(roster.map((r) => Number(r.id)));

  const seatsRaw = db.prepare(
    'SELECT seatRow, seatCol, studentId, seatLabel, meta, lastEditAt FROM session_seat_map WHERE sessionId = ?'
  ).all(sessionId);
  const seats = seatsRaw.map((row) => ({ ...row, meta: parseMeta(row.meta) }));

  const extraIds = new Set();
  for (const row of seatsRaw) {
    if (row.studentId != null && !rosterIds.has(Number(row.studentId))) {
      extraIds.add(Number(row.studentId));
    }
  }

  const guestRows = db.prepare('SELECT studentId FROM session_guest_students WHERE sessionId = ?').all(sessionId);
  for (const g of guestRows) {
    extraIds.add(Number(g.studentId));
  }

  let extras = [];
  if (extraIds.size > 0) {
    const ids = [...extraIds];
    extras = db.prepare(
      `SELECT s.*, c.name as className FROM students s
       LEFT JOIN classes c ON s.classId = c.id
       WHERE s.id IN (${ids.map(() => '?').join(',')}) ORDER BY s.maHV`
    ).all(...ids);
  }

  const students = [
    ...roster.map((s) => ({ ...s, isSessionGuest: false })),
    ...extras.filter((s) => !rosterIds.has(Number(s.id))).map((s) => ({ ...s, isSessionGuest: true })),
  ].map((s) => {
    const out = { ...s };
    if (Number(s.classId) !== Number(hostClassId)) {
      out.transferSuggestion = computeVisitStreakForHostClass(Number(s.id), Number(hostClassId), Number(s.classId));
    } else {
      out.transferSuggestion = {
        suggestTransfer: false,
        streakLength: 0,
        hostClassId: Number(hostClassId),
        hostClassName: null,
      };
    }
    return out;
  });

  const guestStudentIds = guestRows.map((g) => Number(g.studentId));
  return { grid, students, seats, guestStudentIds };
}

module.exports = { buildSeatMapPayload, parseMeta };
