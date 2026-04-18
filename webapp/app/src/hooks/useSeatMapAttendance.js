import { useCallback, useEffect, useMemo, useState } from 'react';
import { sessionsApi, studentsApi } from '../api';

function keyOf(row, col) {
  return `${row}-${col}`;
}

export function useSeatMapAttendance({ open, sessionId }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [grid, setGrid] = useState({ rows: 4, cols: 7 });
  const [seatAssignments, setSeatAssignments] = useState({});
  const [feedbackByStudent, setFeedbackByStudent] = useState({});
  const [initialSnapshot, setInitialSnapshot] = useState('');

  const snapshot = useMemo(
    () => JSON.stringify({ seatAssignments, feedbackByStudent }),
    [seatAssignments, feedbackByStudent]
  );
  const dirty = initialSnapshot !== '' && snapshot !== initialSnapshot;

  const load = useCallback(async () => {
    if (!open || !sessionId) return;
    setLoading(true);
    setError('');
    try {
      const data = await sessionsApi.getSeatMap(sessionId);
      setSession(data.session || null);
      setStudents(Array.isArray(data.students) ? data.students : []);
      setGrid(data.grid || { rows: 4, cols: 7 });
      const nextSeats = {};
      for (const row of data.seats || []) {
        nextSeats[keyOf(row.seatRow, row.seatCol)] = {
          studentId: row.studentId,
          seatLabel: row.seatLabel || null,
          meta: row.meta || null,
        };
      }
      setSeatAssignments(nextSeats);
      const nextFeedback = {};
      for (const report of data.reports || []) {
        nextFeedback[String(report.studentId)] = {
          score: report.score ?? '',
          comment: report.comment ?? '',
        };
      }
      setFeedbackByStudent(nextFeedback);
      const snap = JSON.stringify({ seatAssignments: nextSeats, feedbackByStudent: nextFeedback });
      setInitialSnapshot(snap);
    } catch (e) {
      const message = String(e?.message || '');
      const isNotFound = /not found|404|cannot get/i.test(message);
      if (isNotFound) {
        // Fallback for environments where new backend endpoints are not loaded yet.
        try {
          const sessionData = await sessionsApi.get(sessionId);
          const studentsData = await studentsApi.list({ classId: sessionData.classId });
          setSession(sessionData || null);
          setStudents(Array.isArray(studentsData) ? studentsData : []);
          setGrid({ rows: 4, cols: 7 });
          setSeatAssignments({});
          setFeedbackByStudent({});
          const snap = JSON.stringify({ seatAssignments: {}, feedbackByStudent: {} });
          setInitialSnapshot(snap);
          setError('API sơ đồ chỗ ngồi chưa sẵn sàng trên server. Đang hiển thị danh sách học sinh ở chế độ tạm.');
          return;
        } catch (fallbackError) {
          setError(fallbackError.message || 'Không tải được danh sách học sinh');
          return;
        }
      }
      setError(message || 'Không tải được sơ đồ chỗ ngồi');
    } finally {
      setLoading(false);
    }
  }, [open, sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const studentById = useMemo(() => {
    const map = new Map();
    students.forEach((s) => map.set(Number(s.id), s));
    return map;
  }, [students]);

  const seatByStudent = useMemo(() => {
    const map = new Map();
    Object.entries(seatAssignments).forEach(([seatKey, data]) => {
      if (data?.studentId != null) map.set(Number(data.studentId), seatKey);
    });
    return map;
  }, [seatAssignments]);

  const assignedStudentIds = useMemo(
    () => new Set([...seatByStudent.keys()]),
    [seatByStudent]
  );

  const unassignedStudents = useMemo(
    () => students.filter((s) => !assignedStudentIds.has(Number(s.id))),
    [students, assignedStudentIds]
  );

  const assignStudentToSeat = useCallback((studentId, seatKey) => {
    setSeatAssignments((prev) => {
      const next = { ...prev };
      const sid = Number(studentId);
      const currentSeat = Object.keys(next).find((k) => Number(next[k]?.studentId) === sid);
      if (currentSeat) delete next[currentSeat];
      const occupied = next[seatKey];
      if (occupied?.studentId != null) {
        if (currentSeat) {
          next[currentSeat] = occupied;
        } else {
          delete next[seatKey];
        }
      }
      next[seatKey] = { ...(next[seatKey] || {}), studentId: sid };
      return next;
    });
  }, []);

  const moveSeatToPool = useCallback((seatKey) => {
    setSeatAssignments((prev) => {
      const next = { ...prev };
      delete next[seatKey];
      return next;
    });
  }, []);

  const updateFeedback = useCallback((studentId, patch) => {
    setFeedbackByStudent((prev) => ({
      ...prev,
      [String(studentId)]: {
        score: patch.score ?? prev[String(studentId)]?.score ?? '',
        comment: patch.comment ?? prev[String(studentId)]?.comment ?? '',
      },
    }));
  }, []);

  const save = useCallback(async () => {
    if (!sessionId) return;
    setSaving(true);
    setError('');
    try {
      const seatsPayload = [];
      Object.entries(seatAssignments).forEach(([seatKey, info]) => {
        const [seatRow, seatCol] = seatKey.split('-').map(Number);
        if (!Number.isFinite(seatRow) || !Number.isFinite(seatCol) || info?.studentId == null) return;
        seatsPayload.push({
          seatRow,
          seatCol,
          studentId: Number(info.studentId),
          seatLabel: info.seatLabel || null,
          meta: info.meta || null,
        });
      });

      const reportsPayload = Object.keys(feedbackByStudent).map((studentId) => {
        const value = feedbackByStudent[studentId] || {};
        return {
          studentId: Number(studentId),
          score: value.score ?? '',
          comment: value.comment ?? '',
          syncAttendanceNote: true,
        };
      });

      await sessionsApi.saveSeatMap(sessionId, { seats: seatsPayload });
      await sessionsApi.saveStudentReports(sessionId, { items: reportsPayload });
      const snap = JSON.stringify({ seatAssignments, feedbackByStudent });
      setInitialSnapshot(snap);
    } catch (e) {
      setError(e.message || 'Không lưu được dữ liệu');
      throw e;
    } finally {
      setSaving(false);
    }
  }, [sessionId, seatAssignments, feedbackByStudent]);

  return {
    loading,
    saving,
    error,
    session,
    students,
    grid,
    seatAssignments,
    feedbackByStudent,
    studentById,
    seatByStudent,
    unassignedStudents,
    dirty,
    assignStudentToSeat,
    moveSeatToPool,
    updateFeedback,
    load,
    save,
  };
}

