import { useState, useCallback, useRef } from 'react';
import { attendanceApi } from '../api';

const DEBOUNCE_MS = 800;
const today = new Date().toISOString().slice(0, 10);

function getCellKey(sid, sessId) {
  return `${sid}-${sessId}`;
}

/**
 * Optimistic update + debounced batch save.
 * - setCellValue: updates attendance immediately (optimistic), queues save with 800ms debounce
 * - flushSave: saves queue immediately
 * - On API error: rollback attendance from snapshot
 */
export function useSaveQueue({
  attendance,
  setAttendance,
  sessions,
  ngayHocLte,
  onSaveSuccess,
}) {
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | error
  const [saveError, setSaveError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const queueRef = useRef({}); // cellKey -> { studentId, sessionId, value, note }
  const debounceTimerRef = useRef(null);
  const snapshotRef = useRef(null);

  const flushSave = useCallback(async () => {
    const queue = queueRef.current;
    const entries = Object.entries(queue);
    if (entries.length === 0) return;

    const body = entries.map(([, v]) => ({
      studentId: v.studentId,
      sessionId: v.sessionId,
      value: v.value || null,
      note: v.note || null,
    }));

    queueRef.current = {};
    setPendingCount(0);
    snapshotRef.current = JSON.stringify(attendance);
    setSaveStatus('saving');
    setSaveError(null);

    try {
      await attendanceApi.put(body);
      // Attendance already has optimistic values; no merge needed

      const affectedClassIds = new Set();
      (sessions || []).forEach((s) => {
        if (body.some((b) => b.sessionId === s.id) && s.classId) {
          affectedClassIds.add(s.classId);
        }
      });
      affectedClassIds.forEach((classId) => {
        attendanceApi.clearCache({ classId, ngayHocLte: ngayHocLte || today });
      });

      setSaveStatus('idle');
      onSaveSuccess?.();
    } catch (e) {
      setSaveStatus('error');
      setSaveError(e?.message || 'Lỗi lưu');
      try {
        const snapshot = JSON.parse(snapshotRef.current || '{}');
        setAttendance(snapshot);
      } catch (_) {
        // ignore parse error
      }
      entries.forEach(([key, v]) => {
        queueRef.current[key] = v;
      });
      setPendingCount(entries.length);
    }
  }, [attendance, setAttendance, sessions, ngayHocLte, onSaveSuccess]);

  const scheduleSave = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      flushSave();
    }, DEBOUNCE_MS);
  }, [flushSave]);

  const setCellValue = useCallback(
    (studentId, sessionId, value, note) => {
      const key = getCellKey(studentId, sessionId);
      const existing = attendance[key];
      const prevVal = existing?.value ?? '';
      const prevNote = existing?.note ?? '';
      const newNote = note !== undefined ? note : prevNote;
      if (value === prevVal && (note === undefined || note === prevNote)) return;

      setAttendance((prev) => {
        const next = { ...prev };
        next[key] = {
          ...(prev[key] || {}),
          studentId,
          sessionId,
          value: value ?? prev[key]?.value ?? '',
          note: newNote,
        };
        return next;
      });

      const hadKey = key in queueRef.current;
      queueRef.current[key] = {
        studentId,
        sessionId,
        value: value ?? '',
        note: newNote,
      };
      if (!hadKey) setPendingCount((n) => n + 1);
      scheduleSave();
    },
    [attendance, setAttendance, scheduleSave]
  );

  const getVal = useCallback(
    (sid, sessId) => {
      if (!sessId) return '';
      const key = getCellKey(sid, sessId);
      return attendance[key]?.value ?? '';
    },
    [attendance]
  );

  const getNote = useCallback(
    (sid, sessId) => {
      if (!sessId) return '';
      const key = getCellKey(sid, sessId);
      return attendance[key]?.note ?? '';
    },
    [attendance]
  );

  const getCellKeyFn = useCallback((sid, sessId) => getCellKey(sid, sessId), []);

  return {
    setCellValue,
    getVal,
    getNote,
    getCellKey: getCellKeyFn,
    flushSave,
    saveStatus,
    saveError,
    pendingCount,
    hasPending: pendingCount > 0,
  };
}
