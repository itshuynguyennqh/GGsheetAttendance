import { useState, useCallback, useRef, useMemo } from 'react';
import { attendanceApi, classesApi, sessionsApi } from '../api';
import { formatThangBuoiLabel, compareThangBuoiLabel } from '../utils/formatThangBuoi';

const DEBUG_LOAD = typeof window !== 'undefined' && (
  window.localStorage?.getItem('DEBUG_ATTENDANCE_LOAD') === '1' || import.meta.env?.DEV
);

function logLoad(step, detail) {
  if (DEBUG_LOAD) {
    console.log(`[Attendance Load] ${step}`, detail);
  }
}

/**
 * Build flat rows for virtualization from allClassesData.
 * Each row: { type: 'student' | 'separator', rowIndex, student?, classData? }
 */
function buildFlatRows(allClassesData) {
  const rows = [];
  let rowIndex = 0;
  for (let classIdx = 0; classIdx < allClassesData.length; classIdx++) {
    const classData = allClassesData[classIdx];
    if (classIdx > 0) {
      rows.push({ type: 'separator', rowIndex: rowIndex++ });
    }
    for (const st of classData.students || []) {
      rows.push({ type: 'student', rowIndex: rowIndex++, student: st, classData });
    }
  }
  return rows;
}

export function useAttendanceData({ ngayHocGte, ngayHocLte }) {
  const [classes, setClasses] = useState([]);
  const [allClassesData, setAllClassesData] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [sessionGroups, setSessionGroups] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const studentIndexMapRef = useRef(new Map());
  const sessionIndexMapRef = useRef(new Map());

  const load = useCallback(async () => {
    const loadStart = performance.now();
    logLoad('START', { ngayHocGte, ngayHocLte, allGroups: true });
    setLoading(true);
    setLoadProgress(0);

    try {
      let t0 = performance.now();
      const classesData = await classesApi.list();
      logLoad('classesApi.list', { durationMs: Math.round(performance.now() - t0), count: classesData?.length ?? 0 });
      setClasses(classesData);
      setLoadProgress(15);

      const filterParams = { ngayHocGte, ngayHocLte, allGroups: 1, enableAttendance: 1 };
      t0 = performance.now();
      const { data: allSessionsData, total: totalCount } = await sessionsApi.list(filterParams);
      logLoad('sessionsApi.list', {
        durationMs: Math.round(performance.now() - t0),
        count: allSessionsData?.length ?? 0,
        total: totalCount,
      });
      setLoadProgress(35);

      t0 = performance.now();
      const sessionGroupMap = new Map();
      (allSessionsData || []).forEach((session) => {
        const key =
          formatThangBuoiLabel(session.thang, session.buoi) ||
          `${session.thang}-B${session.buoi}`;
        if (!sessionGroupMap.has(key)) sessionGroupMap.set(key, []);
        sessionGroupMap.get(key).push(session);
      });
      const sortedGroups = Array.from(sessionGroupMap.entries()).sort(([a], [b]) =>
        compareThangBuoiLabel(a, b)
      );
      logLoad('groupSessions', { durationMs: Math.round(performance.now() - t0), groupCount: sortedGroups.length });
      setSessionGroups(sortedGroups);
      setAllSessions(allSessionsData || []);

      const results = new Array(classesData.length).fill(null);
      let fromCache = 0;
      for (let i = 0; i < classesData.length; i++) {
        const cls = classesData[i];
        const attParams = { classId: cls.id, ngayHocGte, ngayHocLte, allGroups: 1 };
        const cached = attendanceApi.getCached(attParams);
        if (cached?.sessions && cached?.students) {
          results[i] = {
            class: cls,
            students: (cached.students || []).sort((a, b) => (a.maHV || '').localeCompare(b.maHV || '')),
            attendance: cached.attendance || {},
            sessions: cached.sessions || [],
          };
          fromCache++;
        }
      }

      if (fromCache === classesData.length && fromCache > 0) {
        logLoad('hydrate from cache', { classCount: fromCache });
        const ordered = results.filter(Boolean);
        const allSt = [];
        const allAtt = {};
        ordered.forEach(({ students, attendance: att }) => {
          students.forEach((s) => {
            if (!allSt.find((e) => e.id === s.id)) allSt.push(s);
          });
          Object.assign(allAtt, att);
        });
        setAllClassesData(ordered);
        setAttendance(allAtt);
        if (ordered.length > 0) setSessions(ordered[0].sessions);
        setLoadProgress(40);
        setLoading(false);
        setRevalidating(true);
      }

      const totalClasses = classesData.length;
      const attTimings = [];

      /* Không gọi setState từng lớp (mergeAndUpdate): mỗi lớp = 1 lần vẽ lại cả lưới
       * (20 buổi × trăm HS × N lớp) → treo main thread. Chỉ cập nhật progress rồi gom 1 lần sau Promise.all. */

      const promises = classesData.map((cls, i) => {
        const attParams = { classId: cls.id, ngayHocGte, ngayHocLte, allGroups: 1 };
        return attendanceApi.get(attParams, { skipCacheValidation: true }).then((attData) => {
          attTimings[i] = {
            classId: cls.id,
            className: cls.name,
            durationMs: 0,
            students: attData?.students?.length ?? 0,
            attendanceKeys: Object.keys(attData?.attendance ?? {}).length,
          };
          results[i] = {
            class: cls,
            students: (attData.students || []).sort((a, b) => (a.maHV || '').localeCompare(b.maHV || '')),
            attendance: attData.attendance || {},
            sessions: attData.sessions || [],
          };
          setLoadProgress(35 + Math.round((55 * attTimings.filter(Boolean).length) / totalClasses));
          return results[i];
        });
      });

      const allClassesDataResult = await Promise.all(promises);
      logLoad('attendanceApi (all classes, parallel)', { timings: attTimings });

      const orderedFinal = allClassesDataResult.filter(Boolean);
      setAllClassesData(orderedFinal);
      if (orderedFinal.length > 0) setSessions(orderedFinal[0].sessions);

      const allStudents = [];
      const allAttendance = {};
      allClassesDataResult.forEach(({ students, attendance: att }) => {
        students.forEach((s) => {
          if (!allStudents.find((existing) => existing.id === s.id)) allStudents.push(s);
        });
        Object.assign(allAttendance, att);
      });
      setAttendance(allAttendance);

      const studentMap = new Map();
      let globalIdx = 0;
      allClassesDataResult.forEach(({ students }) => {
        students.forEach((s) => {
          if (!studentMap.has(s.id)) studentMap.set(s.id, globalIdx++);
        });
      });
      studentIndexMapRef.current = studentMap;

      const sessionMap = new Map();
      (allSessionsData || []).forEach((s, idx) => sessionMap.set(s.id, idx));
      sessionIndexMapRef.current = sessionMap;

      setLoadProgress(100);
      logLoad('DONE', {
        totalMs: Math.round(performance.now() - loadStart),
        classes: allClassesDataResult.length,
        students: allStudents.length,
        attendanceKeys: Object.keys(allAttendance).length,
        sessionGroups: sortedGroups.length,
      });

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRevalidating(false);
      setLoadProgress(0);
    }
  }, [ngayHocGte, ngayHocLte]);

  const rows = useMemo(() => buildFlatRows(allClassesData), [allClassesData]);

  return {
    load,
    classes,
    allClassesData,
    sessionGroups,
    allSessions,
    sessions,
    attendance,
    setAttendance,
    loading,
    revalidating,
    loadProgress,
    rows,
    studentIndexMapRef,
    sessionIndexMapRef,
  };
}
