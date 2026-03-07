import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import { flushSync } from 'react-dom';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowDropDown, NavigateBefore, NavigateNext } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { attendanceApi, classesApi, sessionsApi } from '../api';
import AttendanceImportDialog from '../components/AttendanceImportDialog';

const today = new Date().toISOString().slice(0, 10);
const firstDayOfMonth = new Date();
firstDayOfMonth.setDate(1);
const defaultNgayHocGte = firstDayOfMonth.toISOString().slice(0, 10);

const DEBUG_LOAD = typeof window !== 'undefined' && (
  window.localStorage?.getItem('DEBUG_ATTENDANCE_LOAD') === '1' || import.meta.env?.DEV
);
function logLoad(step, detail) {
  if (DEBUG_LOAD) {
    console.log(`[Attendance Load] ${step}`, detail);
  }
}

// Memoized cell component to prevent unnecessary re-renders
const AttendanceCell = memo(({
  studentId,
  sessionId,
  cellKey,
  value,
  note,
  isSelected,
  isFocused,
  isOpen,
  cellRefs,
  focusedCellRef,
  onValChange,
  onKeyDown,
  onFocus,
  onOpen,
  onClose,
  onClick,
  onCellClick,
  setFocusedCell,
  setSelectedCells,
  setOpenDropdowns,
  getCellKey,
}) => {
  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    onValChange(studentId, sessionId, newValue);
    setFocusedCell(cellKey);
    setSelectedCells(new Set([cellKey]));
    setOpenDropdowns((prev) => {
      if (!prev.has(cellKey)) return prev;
      const next = new Set(prev);
      next.delete(cellKey);
      return next;
    });
  }, [studentId, sessionId, cellKey, onValChange, setFocusedCell, setSelectedCells, setOpenDropdowns]);

  const handleKeyDown = useCallback((e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (!isOpen) {
        e.preventDefault();
        e.stopPropagation();
        onKeyDown(e, studentId, sessionId);
        return false;
      }
      return;
    }
    onKeyDown(e, studentId, sessionId);
  }, [isOpen, onKeyDown, studentId, sessionId]);

  const handleFocus = useCallback((e) => {
    focusedCellRef.current = cellKey;
    setFocusedCell(cellKey);
    if (!e.shiftKey) {
      setSelectedCells((prev) => {
        if (prev.size === 1 && prev.has(cellKey)) {
          return prev;
        }
        return new Set([cellKey]);
      });
    }
  }, [cellKey, focusedCellRef, setFocusedCell, setSelectedCells]);

  const handleOpen = useCallback((e) => {
    if (e && e.type === 'keydown' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e && (e.type === 'click' || e.type === 'mousedown')) {
      const target = e.target || e.currentTarget;
      const isIconClick = target.closest('.MuiSelect-icon') || 
                         target.classList.contains('MuiSelect-icon') ||
                         target.closest('[class*="MuiSelect-icon"]') ||
                         target.closest('[data-icon-click]');
      if (!isIconClick) {
        e.preventDefault();
        e.stopPropagation();
        setOpenDropdowns((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });
        return;
      }
    }
    setFocusedCell(cellKey);
    setSelectedCells(new Set([cellKey]));
    setOpenDropdowns((prev) => new Set(prev).add(cellKey));
  }, [cellKey, setFocusedCell, setSelectedCells, setOpenDropdowns]);

  const handleClose = useCallback(() => {
    setOpenDropdowns((prev) => {
      const next = new Set(prev);
      next.delete(cellKey);
      return next;
    });
  }, [cellKey, setOpenDropdowns]);

  const handleClick = useCallback((e) => {
    const target = e.target;
    const isIconClick = target.closest('.MuiSelect-icon') || 
                       target.classList.contains('MuiSelect-icon') ||
                       target.closest('[class*="MuiSelect-icon"]') ||
                       target.closest('[data-icon-click]');
    
    if (!isIconClick) {
      e.stopPropagation();
      e.preventDefault();
      if (!e.shiftKey) {
        setSelectedCells(new Set([cellKey]));
      }
      setFocusedCell(cellKey);
      if (isOpen) {
        setOpenDropdowns((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });
      }
    }
  }, [cellKey, isOpen, setFocusedCell, setSelectedCells, setOpenDropdowns]);

  const handleIconClick = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setFocusedCell(cellKey);
    setSelectedCells(new Set([cellKey]));
    if (!isOpen) {
      setOpenDropdowns((prev) => new Set(prev).add(cellKey));
    }
  }, [cellKey, isOpen, setFocusedCell, setSelectedCells, setOpenDropdowns]);

  const handleIconMouseDown = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setFocusedCell(cellKey);
    setSelectedCells(new Set([cellKey]));
    if (!isOpen) {
      setOpenDropdowns((prev) => new Set(prev).add(cellKey));
    }
  }, [cellKey, isOpen, setFocusedCell, setSelectedCells, setOpenDropdowns]);

  // Màu nền dựa trên giá trị điểm danh
  const getValueBgColor = (val) => {
    const v = (val || '').toUpperCase();
    if (v === 'M' || v === 'B') return 'primary.light'; // Xanh nước biển
    if (v === 'P') return 'error.light'; // Đỏ
    if (v === 'X') return 'success.light'; // Xanh lá (có mặt)
    return 'transparent';
  };

  return (
    <Tooltip title={note || ''}>
      <TableCell
        align="center"
        padding="none"
        sx={{
          position: 'relative',
          bgcolor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : getValueBgColor(value),
          '&:focus-within': { bgcolor: 'action.focus' },
        }}
        onClick={onCellClick}
      >
        <Select
          ref={(el) => {
            if (el) {
              cellRefs.current[cellKey] = el;
            } else {
              delete cellRefs.current[cellKey];
            }
          }}
          value={value || ''}
          open={isOpen}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onOpen={handleOpen}
          onClose={handleClose}
          onClick={handleClick}
          IconComponent={(props) => (
            <Box
              component="span"
              data-icon-click="true"
              onClick={handleIconClick}
              onMouseDown={handleIconMouseDown}
              sx={{
                cursor: 'pointer',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowDropDown {...props} />
            </Box>
          )}
          size="small"
          data-cell-key={cellKey}
          sx={{
            width: '100%',
            fontWeight: 600,
            '& .MuiSelect-select': {
              py: 0.5,
              px: 1,
              minHeight: 'auto',
              textAlign: 'center',
              cursor: 'default',
              pointerEvents: 'auto',
              '&:hover': {
                cursor: 'default',
              },
            },
            '& .MuiSelect-icon': {
              cursor: 'pointer',
              pointerEvents: 'auto !important',
              zIndex: 1,
            },
            '& .MuiOutlinedInput-notchedOutline': {
              border: isSelected ? '2px solid' : 'none',
              borderColor: isSelected ? 'primary.main' : 'transparent',
            },
            '&:focus .MuiOutlinedInput-notchedOutline': {
              border: '2px solid',
              borderColor: 'primary.main',
            },
          }}
          MenuProps={{
            PaperProps: {
              sx: {
                maxHeight: 200,
              },
            },
            onKeyDown: (e) => {
              if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                return;
              }
              if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.stopPropagation();
                setOpenDropdowns((prev) => {
                  const next = new Set(prev);
                  next.delete(cellKey);
                  return next;
                });
                onKeyDown(e, studentId, sessionId);
              }
            },
          }}
        >
          <MenuItem value="">—</MenuItem>
          <MenuItem value="X">X - Có mặt</MenuItem>
          <MenuItem value="B">B - Bù</MenuItem>
          <MenuItem value="M">M - Nghỉ phép</MenuItem>
          <MenuItem value="P">P - Nghỉ</MenuItem>
        </Select>
        {note && (
          <Box
            component="span"
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              fontSize: '0.7rem',
            }}
          >
            📝
          </Box>
        )}
      </TableCell>
    </Tooltip>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  return (
    prevProps.value === nextProps.value &&
    prevProps.note === nextProps.note &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isFocused === nextProps.isFocused &&
    prevProps.isOpen === nextProps.isOpen
  );
});

AttendanceCell.displayName = 'AttendanceCell';

export default function Attendance() {
  const [searchParams] = useSearchParams();
  const sessionIdParam = searchParams.get('sessionId');
  const classIdParam = searchParams.get('classId');

  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(classIdParam || '');
  const [sessions, setSessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [allClassesData, setAllClassesData] = useState([]); // Data grouped by class
  const [allSessions, setAllSessions] = useState([]); // All sessions grouped by thang-buoi
  const [sessionGroups, setSessionGroups] = useState([]); // Grouped sessions for columns
  const [pending, setPending] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteCell, setNoteCell] = useState(null);
  const [noteValue, setNoteValue] = useState('');
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [copiedValue, setCopiedValue] = useState('');
  const [focusedCell, setFocusedCell] = useState(null);
  const [openDropdowns, setOpenDropdowns] = useState(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [totalGroups, setTotalGroups] = useState(0);
  const [ngayHocGte, setNgayHocGte] = useState(defaultNgayHocGte);
  const [ngayHocLte, setNgayHocLte] = useState(today);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const cellRefs = useRef({});
  const historyRef = useRef([]); // History for undo (Ctrl+Z)
  const historyIndexRef = useRef(-1); // Current position in history
  const navigationTimeoutRef = useRef(null); // For debouncing rapid navigation
  const focusedCellRef = useRef(null); // Track focused cell without causing re-render
  const isNavigatingRef = useRef(false); // Flag to prevent multiple simultaneous navigations
  const studentIndexMapRef = useRef(new Map()); // Cache student id -> index mapping
  const sessionIndexMapRef = useRef(new Map()); // Cache session id -> index mapping
  const lastNavigationTimeRef = useRef(0); // Track last navigation time for throttle
  const pendingNavigationRef = useRef(null); // Store pending navigation for key repeat

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
      logLoad('sessionsApi.list', { durationMs: Math.round(performance.now() - t0), count: allSessionsData?.length ?? 0, total: totalCount });
      setTotalGroups(totalCount);
      setLoadProgress(35);

      t0 = performance.now();
      const sessionGroupMap = new Map();
      allSessionsData.forEach(session => {
        const key = `${session.thang}-B${session.buoi}`;
        if (!sessionGroupMap.has(key)) {
          sessionGroupMap.set(key, []);
        }
        sessionGroupMap.get(key).push(session);
      });
      
      // Sort groups by thang and buoi
      const sortedGroups = Array.from(sessionGroupMap.entries())
        .sort(([a], [b]) => {
          const [aThang, aBuoi] = a.split('-B').map(x => {
            // Handle format like "6.2025" or "6"
            const parts = x.split('.');
            if (parts.length > 1) {
              return parseFloat(x);
            }
            return parseInt(x);
          });
          const [bThang, bBuoi] = b.split('-B').map(x => {
            const parts = x.split('.');
            if (parts.length > 1) {
              return parseFloat(x);
            }
            return parseInt(x);
          });
          if (aThang !== bThang) return aThang - bThang;
          return aBuoi - bBuoi;
        });
      logLoad('groupSessions', { durationMs: Math.round(performance.now() - t0), groupCount: sortedGroups.length });
      setSessionGroups(sortedGroups);
      setAllSessions(allSessionsData);

      // Stale-while-revalidate: show cached attendance immediately if we have it for all classes
      const results = new Array(classesData.length).fill(null);
      let fromCache = 0;
      for (let i = 0; i < classesData.length; i++) {
        const cls = classesData[i];
        const attParams = { classId: cls.id, ngayHocGte, ngayHocLte, page, pageSize };
        const cached = attendanceApi.getCached(attParams);
        if (cached && cached.sessions && cached.students) {
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
        ordered.forEach(({ students, attendance }) => {
          students.forEach(s => {
            if (!allSt.find((e) => e.id === s.id)) allSt.push(s);
          });
          Object.assign(allAtt, attendance);
        });
        setAllClassesData(ordered);
        setStudents(allSt);
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
        ordered.forEach(({ students, attendance }) => {
          students.forEach(s => {
            if (!allSt.find((e) => e.id === s.id)) allSt.push(s);
          });
          Object.assign(allAtt, attendance);
        });
        const doUpdate = () => {
          setAllClassesData(ordered);
          setStudents(allSt);
          setAttendance(allAtt);
          if (ordered.length > 0) setSessions(ordered[0].sessions);
        };
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(doUpdate);
        } else {
          doUpdate();
        }
      };

      const parallelStart = performance.now();
      const promises = classesData.map((cls, i) => {
        const start = performance.now();
        const attParams = { classId: cls.id, ngayHocGte, ngayHocLte, page, pageSize };
        return attendanceApi.get(attParams, { skipCacheValidation: true }).then((attData) => {
          const dur = Math.round(performance.now() - start);
          attTimings[i] = { classId: cls.id, className: cls.name, durationMs: dur, students: attData?.students?.length ?? 0, attendanceKeys: Object.keys(attData?.attendance ?? {}).length };
          logLoad(`attendanceApi.get classId=${cls.id}`, { durationMs: dur, students: attData?.students?.length ?? 0, attendanceCount: Object.keys(attData?.attendance ?? {}).length });
          results[i] = {
            class: cls,
            students: (attData.students || []).sort((a, b) => a.maHV.localeCompare(b.maHV)),
            attendance: attData.attendance || {},
            sessions: attData.sessions || [],
          };
          setLoadProgress(35 + Math.round((55 * (attTimings.filter(Boolean).length)) / totalClasses));
          mergeAndUpdate(results);
          return results[i];
        });
      });

      const allClassesDataResult = await Promise.all(promises);
      const wallClockMs = Math.round(performance.now() - parallelStart);
      const totalAttMs = attTimings.reduce((s, t) => s + (t?.durationMs ?? 0), 0);
      logLoad('attendanceApi (all classes, parallel)', { timings: attTimings, totalMs: totalAttMs, wallClockMs });
      t0 = performance.now();
      
      // Combine all students and attendance for global state
      const allStudents = [];
      const allAttendance = {};
      allClassesDataResult.forEach(({ students, attendance }) => {
        students.forEach(s => {
          if (!allStudents.find(existing => existing.id === s.id)) {
            allStudents.push(s);
          }
        });
        Object.assign(allAttendance, attendance);
      });
      setStudents(allStudents);
      setAttendance(allAttendance);
      
      // Use first class's sessions as default (for backward compatibility)
      if (allClassesDataResult.length > 0) {
        setSessions(allClassesDataResult[0].sessions);
      }
      
      // Rebuild index maps for fast lookup
      const studentMap = new Map();
      let globalIdx = 0;
      allClassesDataResult.forEach(({ students }) => {
        students.forEach(s => {
          if (!studentMap.has(s.id)) {
            studentMap.set(s.id, globalIdx++);
          }
        });
      });
      studentIndexMapRef.current = studentMap;
      
      const sessionMap = new Map();
      allSessionsData.forEach((s, idx) => sessionMap.set(s.id, idx));
      sessionIndexMapRef.current = sessionMap;
      logLoad('buildIndexMaps', { durationMs: Math.round(performance.now() - t0) });
      setLoadProgress(100);
      const totalLoadMs = Math.round(performance.now() - loadStart);
      logLoad('DONE', {
        totalMs: totalLoadMs,
        classes: allClassesDataResult.length,
        students: allStudents.length,
        attendanceKeys: Object.keys(allAttendance).length,
        sessionGroups: sortedGroups.length,
      });
      // Prefetch next page in background for smoother "Trang sau" (defer to avoid competing with main load)
      const totalPages = Math.ceil(totalGroups / pageSize) || 1;
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

  useEffect(() => {
    if (classIdParam) setClassId(classIdParam);
  }, [classIdParam]);

  const isFirstLoadRef = useRef(true);

  // Load all classes by default; debounce when filter/page changes to avoid heavy work on every keystroke
  useEffect(() => {
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      load();
      return;
    }
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Clear selection when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-cell-key]') && !e.target.closest('.MuiMenu-root')) {
        setSelectedCells(new Set());
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getKey = useCallback((sid, sessId) => `${sid}-${sessId}`, []);
  
  // Memoize getVal and getNote to avoid recreating on every render
  const getVal = useCallback((sid, sessId) => {
    if (!sessId) return ''; // No session means empty
    const key = getKey(sid, sessId);
    const p = pending[key];
    if (p) return typeof p === 'object' ? p.value : p;
    const a = attendance[key];
    return a?.value ?? '';
  }, [pending, attendance, getKey]);
  
  const getNote = useCallback((sid, sessId) => {
    if (!sessId) return ''; // No session means no note
    const key = getKey(sid, sessId);
    const p = pending[key];
    if (p && typeof p === 'object' && p.note !== undefined) return p.note;
    const a = attendance[key];
    return a?.note ?? '';
  }, [pending, attendance, getKey]);

  const setVal = useCallback((sid, sessId, val, note, skipHistory = false) => {
    const key = getKey(sid, sessId);
    // Quick check without calling getVal/getNote if possible
    const pendingKey = pending[key];
    const attendanceKey = attendance[key];
    const prev = pendingKey ? (typeof pendingKey === 'object' ? pendingKey.value : pendingKey) : (attendanceKey?.value ?? '');
    const prevNote = pendingKey && typeof pendingKey === 'object' && pendingKey.note !== undefined 
      ? pendingKey.note 
      : (attendanceKey?.note ?? '');
    const newNote = note !== undefined ? note : prevNote;
    
    // Early return if no change
    if (val === prev && (note === undefined || note === prevNote)) return;
    
    // Save to history for undo (unless we're undoing itself)
    if (!skipHistory && (val !== prev || (note !== undefined && note !== prevNote))) {
      const history = historyRef.current;
      const historyIndex = historyIndexRef.current;
      
      // Remove any history after current index (when undoing then making new changes)
      if (historyIndex < history.length - 1) {
        history.splice(historyIndex + 1);
      }
      
      // Add to history
      history.push({
        key,
        studentId: sid,
        sessionId: sessId,
        oldValue: prev,
        oldNote: prevNote,
        newValue: val,
        newNote: newNote,
        timestamp: Date.now(),
      });
      
      // Limit history size to prevent memory issues
      if (history.length > 100) {
        history.shift();
      } else {
        historyIndexRef.current = history.length - 1;
      }
    }
    
    // Use functional update to avoid stale closure
    setPending((p) => {
      // Early return if value hasn't changed
      const existing = p[key];
      const existingVal = existing && typeof existing === 'object' ? existing.value : existing;
      const existingNote = existing && typeof existing === 'object' ? existing.note : undefined;
      if (existingVal === val && (note === undefined || existingNote === newNote)) {
        return p;
      }
      return {
        ...p,
        [key]: { value: val, note: newNote },
      };
    });
  }, [pending, attendance, getKey]);

  const pendingList = Object.entries(pending).map(([key, v]) => {
    const [sid, sessId] = key.split('-').map(Number);
    const s = students.find((x) => x.id === sid);
    const sess = sessions.find((x) => x.id === sessId);
    const old = attendance[key];
    const valObj = typeof v === 'object' ? v : { value: v, note: '' };
    return {
      key,
      studentId: sid,
      sessionId: sessId,
      studentName: s?.hoTen,
      maHV: s?.maHV,
      sessionLabel: sess ? `${sess.thang}-B${sess.buoi}` : '',
      oldValue: old?.value ?? '',
      newValue: valObj.value ?? '',
      note: valObj.note ?? '',
      sessionIdMissing: !sessId,
    };
  });

  useEffect(() => {
    if (confirmOpen && pendingList.length > 0) {
      setSelectedKeys(new Set(pendingList.map((p) => p.key)));
    }
  }, [confirmOpen, pendingList.length]);

  const handleSave = async () => {
    if (pendingList.length === 0) return;
    const selected = selectedKeys.size > 0
      ? pendingList.filter((p) => selectedKeys.has(p.key))
      : pendingList;
    if (selected.length === 0) {
      setConfirmOpen(false);
      setPending({});
      setSelectedKeys(new Set());
      return;
    }
    try {
      const body = selected.map((p) => ({
        studentId: p.studentId,
        sessionId: p.sessionId,
        value: p.newValue || null,
        note: p.note || null,
      }));
      await attendanceApi.put(body);
      
      // Clear cache for affected classes to ensure fresh data
      const affectedClassIds = new Set();
      selected.forEach(p => {
        const sess = sessions.find(s => s.id === p.sessionId);
        if (sess?.classId) {
          affectedClassIds.add(sess.classId);
        }
      });
      affectedClassIds.forEach(classId => {
        attendanceApi.clearCache({ classId, ngayHocLte: today });
      });
      
      setConfirmOpen(false);
      setPending({});
      setSelectedKeys(new Set());
      // Clear history after saving
      historyRef.current = [];
      historyIndexRef.current = -1;
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const getCellKey = useCallback((sid, sessId) => `${sid}-${sessId}`, []);

  const handleKeyDown = useCallback((e, sid, sessId) => {
    const cellKey = getCellKey(sid, sessId);
    
    // Ctrl+Alt+M: Ghi chú
    if (e.ctrlKey && e.altKey && e.key === 'm') {
      e.preventDefault();
      setNoteCell({ sid, sessId });
      setNoteValue(getNote(sid, sessId));
      setNoteOpen(true);
      return;
    }

    // Ctrl+C: Copy
    if (e.ctrlKey && e.key === 'c' && !e.shiftKey) {
      e.preventDefault();
      const val = getVal(sid, sessId);
      setCopiedValue(val);
      navigator.clipboard?.writeText(val);
      return;
    }

    // Ctrl+Z: Undo
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      const history = historyRef.current;
      let historyIndex = historyIndexRef.current;
      
      // If at end of history, start from last entry
      if (historyIndex >= history.length) {
        historyIndex = history.length - 1;
      }
      
      if (historyIndex >= 0 && historyIndex < history.length) {
        const entry = history[historyIndex];
        // Restore old value (skipHistory = true to avoid adding to history)
        setVal(entry.studentId, entry.sessionId, entry.oldValue, entry.oldNote, true);
        // Move back in history
        historyIndexRef.current = historyIndex - 1;
      }
      return;
    }

    // Ctrl+Y: Redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
      e.preventDefault();
      const history = historyRef.current;
      let historyIndex = historyIndexRef.current;
      
      // Move forward in history
      const nextIndex = historyIndex + 1;
      
      if (nextIndex >= 0 && nextIndex < history.length) {
        const entry = history[nextIndex];
        // Restore new value (skipHistory = true to avoid adding to history)
        setVal(entry.studentId, entry.sessionId, entry.newValue, entry.newNote, true);
        // Move forward in history
        historyIndexRef.current = nextIndex;
      }
      return;
    }

    // Ctrl+V: Paste to selected cells or current cell
    if (e.ctrlKey && e.key === 'v' && !e.shiftKey) {
      e.preventDefault();
      // Try to get from clipboard first
      navigator.clipboard?.readText().then((clipboardText) => {
        const pasteValue = clipboardText.trim().toUpperCase();
        if (selectedCells.size > 0) {
          selectedCells.forEach((key) => {
            const [s, sess] = key.split('-').map(Number);
            if (['X', 'B', 'M', 'P', ''].includes(pasteValue)) {
              setVal(s, sess, pasteValue);
            }
          });
        } else {
          if (['X', 'B', 'M', 'P', ''].includes(pasteValue)) {
            setVal(sid, sessId, pasteValue);
          }
        }
      }).catch(() => {
        // Fallback to copiedValue if clipboard read fails
        const pasteValue = copiedValue || '';
        if (selectedCells.size > 0) {
          selectedCells.forEach((key) => {
            const [s, sess] = key.split('-').map(Number);
            if (['X', 'B', 'M', 'P', ''].includes(pasteValue)) {
              setVal(s, sess, pasteValue);
            }
          });
        } else if (['X', 'B', 'M', 'P', ''].includes(pasteValue)) {
          setVal(sid, sessId, pasteValue);
        }
      });
      return;
    }

    // Delete/Backspace: Clear value
    if ((e.key === 'Delete' || e.key === 'Backspace') && !openDropdowns.has(cellKey)) {
      e.preventDefault();
      if (selectedCells.size > 0) {
        // Clear all selected cells
        selectedCells.forEach((key) => {
          const [s, sess] = key.split('-').map(Number);
          setVal(s, sess, '');
        });
      } else {
        // Clear current cell
        setVal(sid, sessId, '');
      }
      return;
    }

    // Arrow keys: Navigate between cells (only when dropdown is closed)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const cellKey = getCellKey(sid, sessId);
      // Check if dropdown menu is open for this cell
      if (openDropdowns.has(cellKey)) {
        // Let the dropdown handle arrow keys when it's open
        return;
      }
      
      // Prevent default to stop Select from opening dropdown
      e.preventDefault();
      e.stopPropagation();
      
      const now = performance.now();
      const isKeyRepeat = e.repeat;
      const timeSinceLastNav = now - lastNavigationTimeRef.current;
      
      // Throttle key repeat: allow first keypress immediately, then throttle repeats
      const throttleDelay = isKeyRepeat ? 30 : 0; // 30ms for key repeat, 0ms for first press
      
      // Use current focused cell from ref instead of props to avoid stale state
      const currentFocusedKey = focusedCellRef.current || getCellKey(sid, sessId);
      const [currentFocusedSid, currentFocusedSessId] = currentFocusedKey.split('-').map(Number);
      
      // Find current position in allClassesData structure
      let currentRowIndex = -1;
      let currentColIndex = -1;
      let currentClassIdx = -1;
      let currentStudentIdx = -1;
      
      // Find which class and student position
      for (let cIdx = 0; cIdx < allClassesData.length; cIdx++) {
        const classData = allClassesData[cIdx];
        const sIdx = classData.students.findIndex(s => s.id === currentFocusedSid);
        if (sIdx !== -1) {
          currentClassIdx = cIdx;
          currentStudentIdx = sIdx;
          // Calculate global row index (including separator rows)
          let globalRowIdx = 0;
          for (let i = 0; i < cIdx; i++) {
            globalRowIdx += allClassesData[i].students.length + (i > 0 ? 1 : 0); // +1 for separator
          }
          globalRowIdx += sIdx;
          currentRowIndex = globalRowIdx;
          break;
        }
      }
      
      // Find column index in sessionGroups
      if (currentFocusedSessId) {
        const colIdx = sessionGroups.findIndex(([_, groupSessions]) => 
          groupSessions.some(s => s.id === currentFocusedSessId)
        );
        if (colIdx !== -1) {
          currentColIndex = colIdx;
        }
      }
      
      if (currentRowIndex === -1 || currentColIndex === -1) {
        // Fallback: use event params
        const fallbackKey = getCellKey(sid, sessId);
        focusedCellRef.current = fallbackKey;
        // Try to find position from event params
        for (let cIdx = 0; cIdx < allClassesData.length; cIdx++) {
          const classData = allClassesData[cIdx];
          const sIdx = classData.students.findIndex(s => s.id === sid);
          if (sIdx !== -1) {
            let globalRowIdx = 0;
            for (let i = 0; i < cIdx; i++) {
              globalRowIdx += allClassesData[i].students.length + (i > 0 ? 1 : 0);
            }
            globalRowIdx += sIdx;
            currentRowIndex = globalRowIdx;
            currentClassIdx = cIdx;
            currentStudentIdx = sIdx;
            break;
          }
        }
        const colIdx = sessionGroups.findIndex(([_, groupSessions]) => 
          groupSessions.some(s => s.id === sessId)
        );
        if (colIdx !== -1) {
          currentColIndex = colIdx;
        }
        if (currentRowIndex === -1 || currentColIndex === -1) {
          return;
        }
      }
      
      if (isNavigatingRef.current || timeSinceLastNav < throttleDelay) {
        // Store pending navigation for key repeat
        if (isKeyRepeat && !isNavigatingRef.current) {
          pendingNavigationRef.current = { 
            e, 
            currentRowIndex, 
            currentColIndex, 
            currentClassIdx, 
            currentStudentIdx, 
            now 
          };
        }
        return;
      }
      
      isNavigatingRef.current = true;
      lastNavigationTimeRef.current = now;
      
      // Calculate total rows (including separators)
      const totalRows = allClassesData.reduce((sum, classData, idx) => 
        sum + classData.students.length + (idx > 0 ? 1 : 0), 0
      );
      
      let newRowIndex = currentRowIndex;
      let newColIndex = currentColIndex;
      let newClassIdx = currentClassIdx;
      let newStudentIdx = currentStudentIdx;

      if (e.key === 'ArrowUp' && currentRowIndex > 0) {
        newRowIndex = currentRowIndex - 1;
        // Recalculate class and student indices
        let rowCount = 0;
        for (let i = 0; i < allClassesData.length; i++) {
          const classData = allClassesData[i];
          const classRowCount = classData.students.length + (i > 0 ? 1 : 0);
          if (rowCount + classRowCount > newRowIndex) {
            newClassIdx = i;
            newStudentIdx = newRowIndex - rowCount - (i > 0 ? 1 : 0);
            break;
          }
          rowCount += classRowCount;
        }
      } else if (e.key === 'ArrowDown' && currentRowIndex < totalRows - 1) {
        newRowIndex = currentRowIndex + 1;
        // Recalculate class and student indices
        let rowCount = 0;
        for (let i = 0; i < allClassesData.length; i++) {
          const classData = allClassesData[i];
          const classRowCount = classData.students.length + (i > 0 ? 1 : 0);
          if (rowCount + classRowCount > newRowIndex) {
            newClassIdx = i;
            newStudentIdx = newRowIndex - rowCount - (i > 0 ? 1 : 0);
            break;
          }
          rowCount += classRowCount;
        }
      } else if (e.key === 'ArrowLeft' && currentColIndex > 0) {
        newColIndex = currentColIndex - 1;
      } else if (e.key === 'ArrowRight' && currentColIndex < sessionGroups.length - 1) {
        newColIndex = currentColIndex + 1;
      }

      if (newRowIndex !== currentRowIndex || newColIndex !== currentColIndex) {
        // Skip separator rows when navigating vertically
        if (newRowIndex !== currentRowIndex) {
          let rowCount = 0;
          for (let i = 0; i < allClassesData.length; i++) {
            const classRowCount = allClassesData[i].students.length + (i > 0 ? 1 : 0);
            if (rowCount <= newRowIndex && newRowIndex < rowCount + classRowCount) {
              // Check if it's the separator row (first row of a class after first class)
              if (i > 0 && newRowIndex === rowCount) {
                // It's a separator, adjust to next/prev student
                if (e.key === 'ArrowUp') {
                  newRowIndex = Math.max(0, newRowIndex - 1);
                } else if (e.key === 'ArrowDown') {
                  newRowIndex = Math.min(totalRows - 1, newRowIndex + 1);
                }
                // Recalculate indices
                rowCount = 0;
                for (let j = 0; j < allClassesData.length; j++) {
                  const crc = allClassesData[j].students.length + (j > 0 ? 1 : 0);
                  if (rowCount + crc > newRowIndex) {
                    newClassIdx = j;
                    newStudentIdx = newRowIndex - rowCount - (j > 0 ? 1 : 0);
                    break;
                  }
                  rowCount += crc;
                }
              }
              break;
            }
            rowCount += classRowCount;
          }
        }
        
        // Get new student and session
        const newClassData = allClassesData[newClassIdx];
        const newStudent = newClassData?.students[newStudentIdx];
        const [_, newGroupSessions] = sessionGroups[newColIndex] || [];
        const newSession = newGroupSessions?.find(s => s.classId === newClassData?.class.id);
        
        // If no session for this class, skip to next available column or row
        if (newStudent && !newSession && (newColIndex !== currentColIndex)) {
          // Try to find next column with session for this class
          let foundSession = null;
          let foundColIdx = newColIndex;
          if (e.key === 'ArrowRight') {
            for (let i = newColIndex + 1; i < sessionGroups.length; i++) {
              const [__, groupSessions] = sessionGroups[i];
              const sess = groupSessions.find(s => s.classId === newClassData.class.id);
              if (sess) {
                foundSession = sess;
                foundColIdx = i;
                break;
              }
            }
          } else if (e.key === 'ArrowLeft') {
            for (let i = newColIndex - 1; i >= 0; i--) {
              const [__, groupSessions] = sessionGroups[i];
              const sess = groupSessions.find(s => s.classId === newClassData.class.id);
              if (sess) {
                foundSession = sess;
                foundColIdx = i;
                break;
              }
            }
          }
          if (foundSession) {
            newColIndex = foundColIdx;
            const newCellKey = getCellKey(newStudent.id, foundSession.id);
            focusedCellRef.current = newCellKey;
            const cellRef = cellRefs.current[newCellKey];
            if (cellRef) {
              const comboboxElement = cellRef.querySelector('[role="combobox"]');
              if (comboboxElement) {
                comboboxElement.focus();
              }
            }
            if (isKeyRepeat) {
              try {
                flushSync(() => {
                  setFocusedCell(newCellKey);
                  setSelectedCells(new Set([newCellKey]));
                });
              } catch (err) {
                setFocusedCell(newCellKey);
                setSelectedCells(new Set([newCellKey]));
              }
            } else {
              setFocusedCell(newCellKey);
              setSelectedCells(new Set([newCellKey]));
            }
            isNavigatingRef.current = false;
            return;
          } else {
            // No session found, can't navigate
            isNavigatingRef.current = false;
            return;
          }
        }
        
        if (newStudent && newSession) {
          const newCellKey = getCellKey(newStudent.id, newSession.id);
          
          // Update ref immediately (no re-render) - this is the source of truth
          focusedCellRef.current = newCellKey;
          
          // Focus FIRST (before React re-render) for instant response
          const cellRef = cellRefs.current[newCellKey];
          if (cellRef) {
            const comboboxElement = cellRef.querySelector('[role="combobox"]');
            if (comboboxElement) {
              // Focus immediately - synchronous, no delay
              comboboxElement.focus();
            }
          }
          
          // Always update state synchronously to avoid race conditions
          // Use flushSync for key repeat to ensure state is updated before next navigation
          if (isKeyRepeat) {
            try {
              flushSync(() => {
                setFocusedCell(newCellKey);
                setSelectedCells(new Set([newCellKey]));
              });
            } catch (err) {
              // Fallback if flushSync fails
              setFocusedCell(newCellKey);
              setSelectedCells(new Set([newCellKey]));
            }
            isNavigatingRef.current = false;
            
              // Process pending navigation if any (with small delay)
              if (pendingNavigationRef.current) {
                const pending = pendingNavigationRef.current;
                pendingNavigationRef.current = null;
                const delay = Math.max(0, throttleDelay - (performance.now() - pending.now));
                setTimeout(() => {
                  // Use stored indices to find student and session
                  const pendingClassData = allClassesData[pending.currentClassIdx];
                  const pendingStudent = pendingClassData?.students[pending.currentStudentIdx];
                  const [_, pendingGroupSessions] = sessionGroups[pending.currentColIndex] || [];
                  const pendingSession = pendingGroupSessions?.find(s => s.classId === pendingClassData?.class.id);
                  if (pendingStudent && pendingSession) {
                    handleKeyDown(pending.e, pendingStudent.id, pendingSession.id);
                  }
                }, delay);
              }
          } else {
            // First keypress: update immediately
            setFocusedCell(newCellKey);
            setSelectedCells(new Set([newCellKey]));
            isNavigatingRef.current = false;
          }
        } else {
          isNavigatingRef.current = false;
        }
      } else {
        isNavigatingRef.current = false;
      }
      return;
    }

    // Enter or Space: Open dropdown (only when closed)
    if ((e.key === 'Enter' || e.key === ' ') && !openDropdowns.has(cellKey)) {
      e.preventDefault();
      setOpenDropdowns((prev) => new Set(prev).add(cellKey));
      return;
    }

    // Direct key input: X, B, M, P
    const k = e.key.toUpperCase();
    if (['X', 'B', 'M', 'P'].includes(k)) {
      e.preventDefault();
      setVal(sid, sessId, k);
    }
  }, [allClassesData, sessionGroups, openDropdowns, selectedCells, copiedValue, getCellKey, getVal, getNote, setVal]);

  const handleCellClick = useCallback((e, sid, sessId) => {
    // Don't handle if clicking directly on Select or its children
    if (e.target.closest('.MuiSelect-select') || e.target.closest('.MuiSelect-root')) {
      return;
    }
    
    const cellKey = getCellKey(sid, sessId);
    
    if (e.shiftKey && focusedCell) {
      // Shift+Click: Select range
      e.preventDefault();
      const [focusedSid, focusedSessId] = focusedCell.split('-').map(Number);
      // Use cached index maps for O(1) lookup
      const focusedRowIndex = studentIndexMapRef.current.get(focusedSid);
      const focusedColIndex = sessionIndexMapRef.current.get(focusedSessId);
      const currentRowIndex = studentIndexMapRef.current.get(sid);
      const currentColIndex = sessionIndexMapRef.current.get(sessId);
      
      if (focusedRowIndex === undefined || focusedColIndex === undefined || 
          currentRowIndex === undefined || currentColIndex === undefined) {
        return;
      }

      const startRow = Math.min(focusedRowIndex, currentRowIndex);
      const endRow = Math.max(focusedRowIndex, currentRowIndex);
      const startCol = Math.min(focusedColIndex, currentColIndex);
      const endCol = Math.max(focusedColIndex, currentColIndex);

      const newSelected = new Set();
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const s = students[r];
          const sess = sessions[c];
          if (s && sess) {
            newSelected.add(getCellKey(s.id, sess.id));
          }
        }
      }
      setSelectedCells(newSelected);
    } else {
      // Regular click: Clear selection and focus this cell
      setSelectedCells(new Set([cellKey]));
      setFocusedCell(cellKey);
    }
  }, [focusedCell, students, sessions]);

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h5" sx={{ fontFamily: 'Lora, serif' }}>
          Điểm danh
        </Typography>
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Đang tải...
            </Typography>
          </Box>
        )}
        {revalidating && !loading && (
          <Typography variant="body2" color="text.secondary">
            Đang cập nhật...
          </Typography>
        )}
      </Box>
      {loading && (
        <LinearProgress
          variant="determinate"
          value={loadProgress}
          sx={{ mb: 1, height: 6, borderRadius: 1 }}
        />
      )}
      <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 140 }}>
            <InputLabel>Lớp</InputLabel>
            <Select value={classId} label="Lớp" onChange={(e) => setClassId(e.target.value)} disabled={loading}>
              <MenuItem value="">Chọn lớp</MenuItem>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            type="date"
            label="Từ ngày"
            value={ngayHocGte}
            onChange={(e) => { setNgayHocGte(e.target.value); setPage(1); }}
            disabled={loading}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ width: 140 }}
          />
          <TextField
            type="date"
            label="Đến ngày"
            value={ngayHocLte}
            onChange={(e) => { setNgayHocLte(e.target.value); setPage(1); }}
            disabled={loading}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ width: 140 }}
          />
          <Button
          variant="contained"
          onClick={() => setConfirmOpen(true)}
          disabled={Object.keys(pending).length === 0}
        >
          Lưu
        </Button>
          <Button variant="outlined" onClick={() => setImportDialogOpen(true)}>
            Import điểm danh
          </Button>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            startIcon={<NavigateBefore />}
          >
            Trang trước
          </Button>
          <Typography variant="body2" sx={{ minWidth: 120 }}>
            Trang {page} / {Math.max(1, Math.ceil(totalGroups / pageSize) || 1)}
          </Typography>
          <Button
            size="small"
            disabled={page >= Math.ceil(totalGroups / pageSize) || loading}
            onClick={() => setPage((p) => p + 1)}
            endIcon={<NavigateNext />}
          >
            Trang sau
          </Button>
          <Typography variant="body2" color="text.secondary">
            ({totalGroups} nhóm buổi)
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          X=có mặt, B=bù, M=nghỉ phép, P=nghỉ · Ctrl+C/V = copy/paste · Ctrl+Z/Y = hoàn tác/làm lại · Del/Backspace = xóa · Shift+Click = chọn nhiều · Mũi tên = di chuyển · Ctrl+Alt+M = ghi chú
        </Typography>
      </Box>
      <TableContainer 
        component={Paper} 
        sx={{ 
          maxHeight: 500, 
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <Table size="small" stickyHeader sx={{ width: '100%', tableLayout: 'auto' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: 'primary.light', minWidth: 80 }}>Mã HV</TableCell>
              <TableCell sx={{ bgcolor: 'primary.light', minWidth: 160 }}>Học sinh</TableCell>
              {sessionGroups.map(([groupKey, groupSessions]) => (
                <TableCell key={groupKey} align="center" sx={{ bgcolor: 'primary.light', minWidth: 60 }}>
                  {groupKey}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {allClassesData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(sessionGroups.length + 2, 3)} align="center" sx={{ py: 4 }}>
                  {loading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={40} />
                      <Typography variant="body2" color="text.secondary">
                        Đang tải dữ liệu...
                      </Typography>
                    </Box>
                  ) : (
                    'Đang tải dữ liệu...'
                  )}
                </TableCell>
              </TableRow>
            ) : (
              allClassesData.map((classData, classIdx) => (
                <React.Fragment key={classData.class.id}>
                  {classIdx > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={sessionGroups.length + 2}
                        sx={{ bgcolor: 'grey.300', height: 2, padding: 0, border: 'none' }}
                      />
                    </TableRow>
                  )}
                  {classData.students.map((st) => (
                    <TableRow key={st.id}>
                      <TableCell>{st.maHV}</TableCell>
                      <TableCell>{st.hoTen}</TableCell>
                      {sessionGroups.map(([groupKey, groupSessions]) => {
                        const session = groupSessions.find(s => s.classId === classData.class.id);
                        if (!session) {
                          return (
                            <TableCell
                              key={`${classData.class.id}-${groupKey}`}
                              align="center"
                              sx={{ bgcolor: 'grey.100', color: 'grey.400', cursor: 'not-allowed', padding: 'none' }}
                            >
                              <Box sx={{ py: 0.5, px: 1, fontWeight: 600, color: 'grey.400' }}>—</Box>
                            </TableCell>
                          );
                        }
                        const cellKey = getCellKey(st.id, session.id);
                        const val = getVal(st.id, session.id);
                        const note = getNote(st.id, session.id);
                        const isSelected = selectedCells.has(cellKey);
                        const isFocused = focusedCell === cellKey;
                        const isOpen = openDropdowns.has(cellKey);
                        return (
                          <AttendanceCell
                            key={`${st.id}-${session.id}`}
                            studentId={st.id}
                            sessionId={session.id}
                            cellKey={cellKey}
                            value={val}
                            note={note}
                            isSelected={isSelected}
                            isFocused={isFocused}
                            isOpen={isOpen}
                            cellRefs={cellRefs}
                            focusedCellRef={focusedCellRef}
                            onValChange={setVal}
                            onKeyDown={handleKeyDown}
                            onFocus={() => {}}
                            onOpen={() => {}}
                            onClose={() => {}}
                            onClick={() => {}}
                            onCellClick={(e) => handleCellClick(e, st.id, session.id)}
                            setFocusedCell={setFocusedCell}
                            setSelectedCells={setSelectedCells}
                            setOpenDropdowns={setOpenDropdowns}
                            getCellKey={getCellKey}
                          />
                        );
                      })}
                    </TableRow>
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Xác nhận thay đổi điểm danh</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Chọn các thay đổi cần áp dụng. Bỏ chọn để loại khỏi batch.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Học sinh</TableCell>
                  <TableCell>Ca học</TableCell>
                  <TableCell>Cũ</TableCell>
                  <TableCell>Mới</TableCell>
                  <TableCell>Ghi chú</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingList.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedKeys.has(p.key)}
                        onChange={(e) => {
                          setSelectedKeys((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p.key);
                            else next.delete(p.key);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>{p.maHV} - {p.studentName}</TableCell>
                    <TableCell>{p.sessionLabel}</TableCell>
                    <TableCell>{p.oldValue || '—'}</TableCell>
                    <TableCell>{p.newValue || '—'}</TableCell>
                    <TableCell>{p.note || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleSave}>Xác nhận</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={noteOpen} onClose={() => setNoteOpen(false)}>
        <DialogTitle>Ghi chú điểm danh</DialogTitle>
        <DialogContent>
          {noteCell && (
            <TextField
              autoFocus
              margin="dense"
              label="Nội dung ghi chú"
              fullWidth
              multiline
              rows={3}
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteOpen(false)}>Hủy</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (noteCell) {
                setVal(noteCell.sid, noteCell.sessId, getVal(noteCell.sid, noteCell.sessId), noteValue);
              }
              setNoteOpen(false);
              setNoteCell(null);
            }}
          >
            Lưu
          </Button>
        </DialogActions>
      </Dialog>
      <AttendanceImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        classes={classes}
        onSuccess={load}
      />
    </Box>
  );
}
