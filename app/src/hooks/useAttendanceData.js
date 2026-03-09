import { useState, useCallback, useRef, useMemo } from 'react';
import { attendanceApi, classesApi, sessionsApi } from '../api';

const DEBUG_LOAD = typeof window !== 'undefined' && (
  window.localStorage?.getItem('DEBUG_ATTENDANCE_LOAD') === '1' || import.meta.env?.DEV
);

function logLoad(step, detail) {
  if (DEBUG_LOAD) {
    console.log(`[Attendance Load] ${step}`, detail);
  }
}

function sortGroupKeys(a, b) {
  const [aThang, aBuoi] = a.split('-B').map(x => {
    const parts = x.split('.');
    return parts.length > 1 ? parseFloat(x) : parseInt(x, 10);
  });
  const [bThang, bBuoi] = b.split('-B').map(x => {
    const parts = x.split('.');
    return parts.length > 1 ? parseFloat(x) : parseInt(x, 10);
  });
  if (aThang !== bThang) return aThang - bThang;
  return aBuoi - bBuoi;
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

export function useAttendanceData({ ngayHocGte, ngayHocLte, page, pageSize }) {
  const [classes, setClasses] = useState([]);
  const [allClassesData, setAllClassesData] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [sessionGroups, setSessionGroups] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0);
  const studentIndexMapRef = useRef(new Map());
  const sessionIndexMapRef = useRef(new Map());

  const load = useCallback(async () => {
    const loadStart = performance.now();
    logLoad('START', { ngayHocGte, ngayHocLte, page, pageSize });
    setLoading(true);
    setLoadProgress(0);

    try {
      let t0 = performance.now();
      const classesData = await classesApi.list();
      logLoad('classesApi.list', { durationMs: Math.round(performance.now() - t0), count: classesData?.length ?? 0 });
      setClasses(classesData);
      setLoadProgress(15);

      const filterParams = { ngayHocGte, ngayHocLte, page, pageSize, enableAttendance: 1 };
      t0 = performance.now();
      const { data: allSessionsData, total: totalCount } = await sessionsApi.list(filterParams);
      logLoad('sessionsApi.list', {
        durationMs: Math.round(performance.now() - t0),
        count: allSessionsData?.length ?? 0,
        total: totalCount,
      });
      setTotalGroups(totalCount ?? 0);
      setLoadProgress(35);

      t0 = performance.now();
      const sessionGroupMap = new Map();
      (allSessionsData || []).forEach((session) => {
        const key = `${session.thang}-B${session.buoi}`;
        if (!sessionGroupMap.has(key)) sessionGroupMap.set(key, []);
        sessionGroupMap.get(key).push(session);
      });
      const sortedGroups = Array.from(sessionGroupMap.entries()).sort(([a], [b]) => sortGroupKeys(a, b));
      logLoad('groupSessions', { durationMs: Math.round(performance.now() - t0), groupCount: sortedGroups.length });
      setSessionGroups(sortedGroups);
      setAllSessions(allSessionsData || []);

      const results = new Array(classesData.length).fill(null);
      let fromCache = 0;
      for (let i = 0; i < classesData.length; i++) {
        const cls = classesData[i];
        const attParams = { classId: cls.id, ngayHocGte, ngayHocLte, page, pageSize };
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

      const mergeAndUpdate = (res) => {
        const ordered = classesData.map((cls, i) => res[i]).filter(Boolean);
        if (ordered.length === 0) return;
        const allSt = [];
        const allAtt = {};
        ordered.forEach(({ students, attendance: att }) => {
          students.forEach((s) => {
            if (!allSt.find((e) => e.id === s.id)) allSt.push(s);
          });
          Object.assign(allAtt, att);
        });
        const doUpdate = () => {
          setAllClassesData(ordered);
          setAttendance(allAtt);
          if (ordered.length > 0) setSessions(ordered[0].sessions);
        };
        requestAnimationFrame ? requestAnimationFrame(doUpdate) : doUpdate();
      };

      const promises = classesData.map((cls, i) => {
        const attParams = { classId: cls.id, ngayHocGte, ngayHocLte, page, pageSize };
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
          mergeAndUpdate(results);
          return results[i];
        });
      });

      const allClassesDataResult = await Promise.all(promises);
      logLoad('attendanceApi (all classes, parallel)', { timings: attTimings });

      const allStudents = [];
      const allAttendance = {};
      allClassesDataResult.forEach(({ students, attendance: att }) => {
        students.forEach((s) => {
          if (!allStudents.find((existing) => existing.id === s.id)) allStudents.push(s);
        });
        Object.assign(allAttendance, att);
      });
      setAttendance(allAttendance);
      if (allClassesDataResult.length > 0) setSessions(allClassesDataResult[0].sessions);

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

      const totalPages = Math.ceil((totalCount ?? 0) / pageSize) || 1;
      if (page < totalPages && page >= 1) {
        const nextPage = page + 1;
        const prefetch = () => {
          classesData.forEach((cls) => {
            const attParams = { classId: cls.id, ngayHocGte, ngayHocLte, page: nextPage, pageSize };
            attendanceApi.get(attParams, { skipCacheValidation: true }).catch(() => {});
          });
          logLoad('prefetch next page', { page: nextPage });
        };
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(prefetch, { timeout: 2000 });
        } else {
          setTimeout(prefetch, 800);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRevalidating(false);
      setLoadProgress(0);
    }
  }, [ngayHocGte, ngayHocLte, page, pageSize]);

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
    totalGroups,
    rows,
    studentIndexMapRef,
    sessionIndexMapRef,
  };
}
