const { db } = require('../db');

const STREAK_THRESHOLD = 3;

function isPresentAtSession(studentId, sessionId) {
  const seat = db.prepare('SELECT 1 FROM session_seat_map WHERE sessionId = ? AND studentId = ?').get(sessionId, studentId);
  if (seat) return true;
  const guest = db.prepare('SELECT 1 FROM session_guest_students WHERE sessionId = ? AND studentId = ?').get(sessionId, studentId);
  if (guest) return true;
  const att = db.prepare('SELECT value, note FROM attendance WHERE sessionId = ? AND studentId = ?').get(sessionId, studentId);
  if (!att) return false;
  const v = att.value != null && String(att.value).trim() !== '';
  const n = att.note != null && String(att.note).trim() !== '';
  return v || n;
}

function computeVisitStreakForHostClass(studentId, hostClassId, homeClassId) {
  if (!Number.isFinite(Number(hostClassId)) || !Number.isFinite(Number(homeClassId))) {
    return { suggestTransfer: false, streakLength: 0, hostClassId, hostClassName: null };
  }
  if (Number(hostClassId) === Number(homeClassId)) {
    return { suggestTransfer: false, streakLength: 0, hostClassId, hostClassName: null };
  }

  const sessions = db.prepare(
    `SELECT id FROM sessions WHERE classId = ? AND enableAttendance = 1 ORDER BY ngayHoc, startTime, id`
  ).all(hostClassId);

  let best = 0;
  let cur = 0;
  for (const sess of sessions) {
    if (isPresentAtSession(studentId, sess.id)) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }

  const hostNameRow = db.prepare('SELECT name FROM classes WHERE id = ?').get(hostClassId);
  return {
    suggestTransfer: best >= STREAK_THRESHOLD,
    streakLength: best,
    hostClassId: Number(hostClassId),
    hostClassName: hostNameRow?.name || null,
  };
}

module.exports = { computeVisitStreakForHostClass, STREAK_THRESHOLD, isPresentAtSession };
