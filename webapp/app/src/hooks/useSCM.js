import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { attendanceApi, sessionsApi } from '../api';
import { hasAttendanceRecord } from '../utils/attendanceRecord';

/** Map GET /attendance attendance object (keys studentId-sessionId) to studentId -> row */
function mapAttendanceByStudent(attendanceObj, sessionId) {
  const sid = Number(sessionId);
  const out = {};
  if (!attendanceObj || typeof attendanceObj !== 'object' || !Number.isFinite(sid)) return out;
  for (const [key, row] of Object.entries(attendanceObj)) {
    const k = String(key);
    const i = k.lastIndexOf('-');
    if (i <= 0) continue;
    const stu = Number(k.slice(0, i));
    const sess = Number(k.slice(i + 1));
    if (!Number.isFinite(stu) || sess !== sid) continue;
    out[stu] = {
      value: row?.value != null && String(row.value).trim() !== '' ? String(row.value).trim() : '',
      note: row?.note != null && String(row.note).trim() !== '' ? String(row.note).trim() : '',
    };
  }
  return out;
}

function keyOf(row, col) {
  return `${row}-${col}`;
}

function sortedIds(arr) {
  return [...arr]
    .map((x) => Number(x))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function computeInitialGuestSave(seatsArray, guestIdsFromDb, students, hostClassId) {
  const union = new Set(sortedIds(guestIdsFromDb || []));
  const hostId = Number(hostClassId);
  const byId = new Map((students || []).map((s) => [Number(s.id), s]));
  for (const row of seatsArray || []) {
    if (row.studentId == null) continue;
    const st = byId.get(Number(row.studentId));
    if (st && Number(st.classId) !== hostId) union.add(Number(row.studentId));
  }
  return sortedIds([...union]);
}

export function useSCM({ sessionId }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [guestStudentIds, setGuestStudentIds] = useState([]);
  const [grid, setGrid] = useState({ rows: 4, cols: 7, disabledSeats: [] });
  const [seatAssignments, setSeatAssignments] = useState({});

  const [initialSeatStr, setInitialSeatStr] = useState('');
  const [initialGuestSaveStr, setInitialGuestSaveStr] = useState('');

  const [seatStatuses, setSeatStatuses] = useState({});
  const [attendanceByStudentId, setAttendanceByStudentId] = useState({});
  const attendanceByStudentIdRef = useRef({});
  useEffect(() => {
    attendanceByStudentIdRef.current = attendanceByStudentId;
  }, [attendanceByStudentId]);

  const studentById = useMemo(() => {
    const map = new Map();
    students.forEach((s) => map.set(Number(s.id), s));
    return map;
  }, [students]);

  const guestIdsForSave = useMemo(() => {
    const union = new Set(sortedIds(guestStudentIds));
    const hostId = Number(session?.classId);
    if (!Number.isFinite(hostId)) return sortedIds([...union]);
    for (const info of Object.values(seatAssignments)) {
      if (info?.studentId == null) continue;
      const st = studentById.get(Number(info.studentId));
      if (st && Number(st.classId) !== hostId) union.add(Number(info.studentId));
    }
    return sortedIds([...union]);
  }, [guestStudentIds, seatAssignments, session, studentById]);

  const dirty = useMemo(() => {
    if (initialSeatStr === '' || initialGuestSaveStr === '') return false;
    const curSeats = JSON.stringify(seatAssignments);
    const curGuest = JSON.stringify(guestIdsForSave);
    return curSeats !== initialSeatStr || curGuest !== initialGuestSaveStr;
  }, [initialSeatStr, initialGuestSaveStr, seatAssignments, guestIdsForSave]);

  const refreshSessionAttendance = useCallback(async () => {
    if (!sessionId) return;
    try {
      const attData = await attendanceApi.get(
        { sessionId: String(sessionId) },
        { skipCacheValidation: true }
      );
      setAttendanceByStudentId(mapAttendanceByStudent(attData?.attendance, sessionId));
    } catch {
      setAttendanceByStudentId({});
    }
  }, [sessionId]);

  const load = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!sessionId) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await sessionsApi.getSeatMap(sessionId);
      setSession(data.session || null);
      setStudents(Array.isArray(data.students) ? data.students : []);
      setGuestStudentIds(sortedIds(data.guestStudentIds || []));

      const gridData = data.grid || { rows: 4, cols: 7 };
      setGrid({ ...gridData, disabledSeats: gridData.disabledSeats || [] });

      const nextSeats = {};
      for (const row of data.seats || []) {
        nextSeats[keyOf(row.seatRow, row.seatCol)] = {
          studentId: row.studentId,
          seatLabel: row.seatLabel || null,
          meta: row.meta || null,
        };
      }
      setSeatAssignments(nextSeats);
      setInitialSeatStr(JSON.stringify(nextSeats));
      const initGuestSave = computeInitialGuestSave(
        data.seats,
        data.guestStudentIds,
        data.students,
        data.session?.classId
      );
      setInitialGuestSaveStr(JSON.stringify(initGuestSave));

      try {
        const attData = await attendanceApi.get(
          { sessionId: String(sessionId) },
          { skipCacheValidation: true }
        );
        setAttendanceByStudentId(mapAttendanceByStudent(attData?.attendance, sessionId));
      } catch {
        setAttendanceByStudentId({});
      }
    } catch (e) {
      setError(e.message || 'Không tải được dữ liệu');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!sessionId) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') refreshSessionAttendance();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [sessionId, refreshSessionAttendance]);

  const seatByStudent = useMemo(() => {
    const map = new Map();
    Object.entries(seatAssignments).forEach(([seatKey, data]) => {
      if (data?.studentId != null) map.set(Number(data.studentId), seatKey);
    });
    return map;
  }, [seatAssignments]);

  const unassignedStudents = useMemo(
    () => students.filter((s) => !seatByStudent.has(Number(s.id))),
    [students, seatByStudent]
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

  const batchAssign = useCallback((assignments) => {
    setSeatAssignments((prev) => {
      const next = { ...prev };
      for (const { seatKey, studentId } of assignments) {
        const sid = Number(studentId);
        const currentSeat = Object.keys(next).find((k) => Number(next[k]?.studentId) === sid);
        if (currentSeat) delete next[currentSeat];
        next[seatKey] = { ...(next[seatKey] || {}), studentId: sid };
      }
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

  const clearAllSeats = useCallback(() => {
    setSeatAssignments({});
  }, []);

  const addGuestStudent = useCallback((student) => {
    const id = Number(student?.id);
    if (!Number.isFinite(id)) return;
    setGuestStudentIds((prev) => sortedIds([...new Set([...prev, id])]));
    setStudents((prev) => {
      if (prev.some((s) => Number(s.id) === id)) return prev;
      return [...prev, { ...student, isSessionGuest: true }];
    });
  }, []);

  const removeGuestStudent = useCallback((studentId) => {
    const sid = Number(studentId);
    if (!Number.isFinite(sid)) return;
    setGuestStudentIds((prev) => prev.filter((x) => x !== sid));
    setStudents((prev) => {
      const hostId = Number(session?.classId);
      return prev.filter((s) => {
        if (Number(s.id) !== sid) return true;
        if (Number(s.classId) === hostId) return true;
        return false;
      });
    });
  }, [session?.classId]);

  const save = useCallback(async () => {
    if (!sessionId) return;
    setSaving(true);
    setError('');
    try {
      const seatsPayload = [];
      Object.entries(seatAssignments).forEach(([seatKey, info]) => {
        const [seatRow, seatCol] = seatKey.split('-').map(Number);
        if (!Number.isFinite(seatRow) || !Number.isFinite(seatCol)) return;
        seatsPayload.push({
          seatRow,
          seatCol,
          studentId: info?.studentId != null ? Number(info.studentId) : null,
          seatLabel: info.seatLabel || null,
          meta: info.meta || null,
        });
      });
      await sessionsApi.saveSeatMap(sessionId, {
        seats: seatsPayload,
        guestStudentIds: guestIdsForSave,
      });
      await load({ silent: true });
    } catch (e) {
      setError(e.message || 'Không lưu được');
      throw e;
    } finally {
      setSaving(false);
    }
  }, [sessionId, seatAssignments, guestIdsForSave, load]);

  const putSessionAttendance = useCallback(
    async ({ studentId, value, note, clear }) => {
      const sid = Number(studentId);
      const sessId = Number(sessionId);
      if (!Number.isFinite(sid) || !Number.isFinite(sessId) || !session) return;

      const cur = attendanceByStudentIdRef.current[sid] || { value: '', note: '' };
      let vPut;
      let nPut;
      if (clear) {
        vPut = null;
        nPut = null;
      } else {
        const nextVal = value !== undefined ? String(value || '') : cur.value;
        const nextNote = note !== undefined ? String(note || '') : cur.note;
        vPut = nextVal.trim() ? nextVal.trim().toUpperCase() : null;
        nPut = nextNote.trim() ? nextNote.trim() : null;
        if (!vPut && !nPut) return;
      }

      try {
        await attendanceApi.put([
          {
            studentId: sid,
            sessionId: sessId,
            ngayDiemDanh: session.ngayHoc || null,
            value: vPut,
            note: nPut,
          },
        ]);
        attendanceApi.clearCache();
        if (clear || (!vPut && !nPut)) {
          setAttendanceByStudentId((prev) => {
            const copy = { ...prev };
            delete copy[sid];
            return copy;
          });
        } else {
          setAttendanceByStudentId((prev) => ({
            ...prev,
            [sid]: { value: vPut || '', note: nPut || '' },
          }));
        }
      } catch (e) {
        refreshSessionAttendance();
        throw e;
      }
    },
    [sessionId, session, refreshSessionAttendance]
  );

  return {
    loading,
    saving,
    error,
    session,
    students,
    guestStudentIds,
    guestIdsForSave,
    grid,
    seatAssignments,
    studentById,
    seatByStudent,
    unassignedStudents,
    dirty,
    seatStatuses,
    assignStudentToSeat,
    batchAssign,
    moveSeatToPool,
    clearAllSeats,
    addGuestStudent,
    removeGuestStudent,
    setSeatStatuses,
    load,
    save,
    setGrid,
    attendanceByStudentId,
    refreshSessionAttendance,
    putSessionAttendance,
    hasAttendanceRecord,
  };
}

export { hasAttendanceRecord };
