const { db } = require('../db');

function mergeCrossClassStudents(sessionIds, hostClassId, rosterStudents) {
  if (!sessionIds.length || hostClassId == null || hostClassId === '') return rosterStudents;
  const hostClassIdNum = Number(hostClassId);
  const rosterIds = new Set(rosterStudents.map((s) => Number(s.id)));
  const extraIds = new Set();
  const ph = sessionIds.map(() => '?').join(',');

  let g = [];
  try {
    g = db.prepare(`SELECT DISTINCT studentId FROM session_guest_students WHERE sessionId IN (${ph})`).all(...sessionIds);
  } catch {
    g = [];
  }
  g.forEach((r) => extraIds.add(Number(r.studentId)));

  const sm = db.prepare(
    `SELECT DISTINCT m.studentId FROM session_seat_map m
     INNER JOIN sessions sess ON sess.id = m.sessionId
     INNER JOIN students st ON st.id = m.studentId
     WHERE m.sessionId IN (${ph}) AND sess.classId = ? AND st.classId != ?`
  ).all(...sessionIds, hostClassIdNum, hostClassIdNum);
  sm.forEach((r) => extraIds.add(Number(r.studentId)));

  const att = db.prepare(
    `SELECT DISTINCT a.studentId FROM attendance a
     INNER JOIN sessions sess ON sess.id = a.sessionId
     INNER JOIN students st ON st.id = a.studentId
     WHERE a.sessionId IN (${ph}) AND sess.classId = ? AND st.classId != ?`
  ).all(...sessionIds, hostClassIdNum, hostClassIdNum);
  att.forEach((r) => extraIds.add(Number(r.studentId)));

  for (const id of rosterIds) extraIds.delete(id);
  if (extraIds.size === 0) return rosterStudents;
  const ids = [...extraIds];
  const extras = db.prepare(
    `SELECT s.*, c.name as className FROM students s
     LEFT JOIN classes c ON s.classId = c.id
     WHERE s.id IN (${ids.map(() => '?').join(',')}) ORDER BY s.maHV`
  ).all(...ids);
  return [...rosterStudents, ...extras];
}

module.exports = { mergeCrossClassStudents };
