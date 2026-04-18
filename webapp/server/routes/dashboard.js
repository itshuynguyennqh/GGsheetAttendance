const express = require('express');
const router = express.Router();
const { db } = require('../db');

function isAttend(v) {
  const x = String(v || '').trim().toUpperCase();
  return x === 'X' || x === 'B' || x === 'M';
}
function isAbsence(v) {
  const x = String(v || '').trim().toUpperCase();
  return x === 'P';
}

function calculateStreak(values) {
  const filtered = values.filter((v) => {
    const x = String(v || '').trim().toUpperCase();
    return ['X', 'B', 'M', 'P'].includes(x);
  });
  let maxAttend = 0, currentAttend = 0;
  let maxAbsence = 0, currentAbsence = 0;
  let latestStreak = 0;
  filtered.forEach((val) => {
    if (isAttend(val)) {
      currentAttend++;
      currentAbsence = 0;
      if (currentAttend > maxAttend) maxAttend = currentAttend;
    } else if (isAbsence(val)) {
      currentAbsence++;
      currentAttend = 0;
      if (currentAbsence > maxAbsence) maxAbsence = currentAbsence;
    }
  });
  if (filtered.length > 0) {
    const lastVal = filtered[filtered.length - 1];
    const lastIsAttend = isAttend(lastVal);
    let j = filtered.length - 1;
    while (j >= 0 && isAttend(filtered[j]) === lastIsAttend) {
      latestStreak++;
      j--;
    }
    if (!lastIsAttend) latestStreak = -latestStreak;
  }
  return { currentStreak: latestStreak, maxAttendStreak: maxAttend, maxAbsenceStreak: maxAbsence };
}

router.get('/streak', (req, res) => {
  try {
    const { classId } = req.query;
    const sessions = db.prepare(
      'SELECT id FROM sessions WHERE classId = ? AND enableAttendance = 1 ORDER BY ngayHoc, startTime'
    ).all(classId || 0);
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) {
      return res.json({ students: [], sessions: [] });
    }

    const placeholders = sessionIds.map(() => '?').join(',');
    const students = db.prepare(
      `SELECT * FROM students WHERE classId = ? ORDER BY maHV`
    ).all(classId || 0);
    const attendance = db.prepare(
      `SELECT * FROM attendance WHERE sessionId IN (${placeholders})`
    ).all(...sessionIds);

    const byStudent = {};
    attendance.forEach((a) => {
      if (!byStudent[a.studentId]) byStudent[a.studentId] = {};
      byStudent[a.studentId][a.sessionId] = a.value;
    });

    const result = students.map((s) => {
      const vals = sessionIds.map((sid) => (byStudent[s.id] && byStudent[s.id][sid]) || '');
      const streak = calculateStreak(vals);
      return {
        id: s.id,
        maHV: s.maHV,
        hoTen: s.hoTen,
        ...streak,
      };
    });

    res.json({
      students: result,
      sessions: sessions.length,
      positiveStreak: result.filter((r) => r.currentStreak > 0).length,
      negativeStreak: result.filter((r) => r.currentStreak < 0).length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
