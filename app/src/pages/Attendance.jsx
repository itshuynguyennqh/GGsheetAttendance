import React, { useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useAttendanceData } from '../hooks/useAttendanceData';
import { useSaveQueue } from '../hooks/useSaveQueue';
import AttendanceGrid from '../components/AttendanceGrid';
import AttendanceImportDialog from '../components/AttendanceImportDialog';

const today = new Date().toISOString().slice(0, 10);
const firstDayOfMonth = new Date();
firstDayOfMonth.setDate(1);
const defaultNgayHocGte = firstDayOfMonth.toISOString().slice(0, 10);

export default function Attendance() {
  const [searchParams] = useSearchParams();
  const classIdParam = searchParams.get('classId');
  const [classId, setClassId] = useState(classIdParam || '');
  const [ngayHocGte, setNgayHocGte] = useState(defaultNgayHocGte);
  const [ngayHocLte, setNgayHocLte] = useState(today);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [focusedCell, setFocusedCell] = useState(null);
  const [openDropdowns, setOpenDropdowns] = useState(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteCell, setNoteCell] = useState(null);
  const [noteValue, setNoteValue] = useState('');
  const [copiedValue, setCopiedValue] = useState('');
  const cellRefs = useRef({});
  const focusedCellRef = useRef(null);
  const isFirstLoadRef = useRef(true);

  const data = useAttendanceData({ ngayHocGte, ngayHocLte });
  const {
    load,
    classes,
    allClassesData,
    sessionGroups,
    sessions,
    attendance,
    setAttendance,
    loading,
    revalidating,
    loadProgress,
    rows,
    studentIndexMapRef,
    sessionIndexMapRef,
  } = data;

  const saveQueue = useSaveQueue({
    attendance,
    setAttendance,
    sessions,
    ngayHocLte,
    onSaveSuccess: load,
  });
  const {
    setCellValue,
    getVal,
    getNote,
    getCellKey,
    flushSave,
    saveStatus,
    saveError,
    hasPending,
  } = saveQueue;

  useEffect(() => {
    if (classIdParam) setClassId(classIdParam);
  }, [classIdParam]);

  useEffect(() => {
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      load();
      return;
    }
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-cell-key]') && !e.target.closest('.MuiMenu-root')) {
        setSelectedCells(new Set());
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const findRowCol = useCallback(
    (sid, sessId) => {
      const rowIdx = rows.findIndex((r) => r.type === 'student' && r.student?.id === sid);
      const colIdx = sessionGroups.findIndex(([, gs]) => gs?.some((s) => s.id === sessId));
      return { rowIdx, colIdx };
    },
    [rows, sessionGroups]
  );

  const getStudentSessionAt = useCallback(
    (rowIdx, colIdx) => {
      const row = rows[rowIdx];
      if (!row || row.type !== 'student') return null;
      const [, groupSessions] = sessionGroups[colIdx] || [];
      const session = groupSessions?.find((s) => s.classId === row.classData?.class?.id);
      return session ? { student: row.student, session } : null;
    },
    [rows, sessionGroups]
  );

  const handleKeyDown = useCallback(
    (e, sid, sessId) => {
      const cellKey = getCellKey(sid, sessId);

      if (e.ctrlKey && e.altKey && e.key === 'm') {
        e.preventDefault();
        setNoteCell({ sid, sessId });
        setNoteValue(getNote(sid, sessId));
        setNoteOpen(true);
        return;
      }

      if (e.ctrlKey && e.key === 'c' && !e.shiftKey) {
        e.preventDefault();
        setCopiedValue(getVal(sid, sessId));
        navigator.clipboard?.writeText(getVal(sid, sessId));
        return;
      }

      if (e.ctrlKey && e.key === 'v' && !e.shiftKey) {
        e.preventDefault();
        navigator.clipboard?.readText().then((text) => {
          const v = (text?.trim() || '').toUpperCase();
          if (['X', 'B', 'M', 'P', ''].includes(v)) {
            if (selectedCells.size > 0) {
              selectedCells.forEach((key) => {
                const [s, sess] = key.split('-').map(Number);
                setCellValue(s, sess, v);
              });
            } else {
              setCellValue(sid, sessId, v);
            }
          }
        }).catch(() => {
          const v = (copiedValue || '').toUpperCase();
          if (['X', 'B', 'M', 'P', ''].includes(v)) setCellValue(sid, sessId, v);
        });
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !openDropdowns.has(cellKey)) {
        e.preventDefault();
        if (selectedCells.size > 0) {
          selectedCells.forEach((key) => {
            const [s, sess] = key.split('-').map(Number);
            setCellValue(s, sess, '');
          });
        } else {
          setCellValue(sid, sessId, '');
        }
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const { rowIdx, colIdx } = findRowCol(sid, sessId);
        if (rowIdx < 0 || colIdx < 0) return;

        let newRow = rowIdx;
        let newCol = colIdx;
        if (e.key === 'ArrowUp' && rowIdx > 0) {
          newRow = rowIdx - 1;
          while (newRow >= 0 && rows[newRow]?.type === 'separator') newRow--;
        } else if (e.key === 'ArrowDown' && rowIdx < rows.length - 1) {
          newRow = rowIdx + 1;
          while (newRow < rows.length && rows[newRow]?.type === 'separator') newRow++;
        } else if (e.key === 'ArrowLeft' && colIdx > 0) newCol = colIdx - 1;
        else if (e.key === 'ArrowRight' && colIdx < sessionGroups.length - 1) newCol = colIdx + 1;

        const next = getStudentSessionAt(newRow, newCol);
        if (next) {
          const newKey = getCellKey(next.student.id, next.session.id);
          focusedCellRef.current = newKey;
          const root = cellRefs.current[newKey];
          const el = root?.tagName === 'SELECT' ? root : root?.querySelector?.('[role="combobox"]');
          if (el?.focus) el.focus();
          setFocusedCell(newKey);
          setSelectedCells(new Set([newKey]));
        }
        return;
      }

      if ((e.key === 'Enter' || e.key === ' ') && !openDropdowns.has(cellKey)) {
        e.preventDefault();
        setOpenDropdowns((prev) => new Set(prev).add(cellKey));
        return;
      }

      const k = e.key.toUpperCase();
      if (['X', 'B', 'M', 'P'].includes(k)) {
        e.preventDefault();
        setCellValue(sid, sessId, k);
      }
    },
    [
      getCellKey,
      getVal,
      getNote,
      setCellValue,
      selectedCells,
      openDropdowns,
      copiedValue,
      findRowCol,
      getStudentSessionAt,
      rows,
      sessionGroups,
    ]
  );

  const handleCellClick = useCallback(
    (e, sid, sessId) => {
      if (e.target?.closest('select') || e.target?.closest('.MuiSelect-select') || e.target?.closest('.MuiSelect-root')) return;
      const cellKey = getCellKey(sid, sessId);
      if (e.shiftKey && focusedCell) {
        e.preventDefault();
        const [focusedSid, focusedSessId] = focusedCell.split('-').map(Number);
        const fr = findRowCol(focusedSid, focusedSessId);
        const cr = findRowCol(sid, sessId);
        if (fr.rowIdx < 0 || fr.colIdx < 0 || cr.rowIdx < 0 || cr.colIdx < 0) return;
        const newSelected = new Set();
        const r0 = Math.min(fr.rowIdx, cr.rowIdx);
        const r1 = Math.max(fr.rowIdx, cr.rowIdx);
        const c0 = Math.min(fr.colIdx, cr.colIdx);
        const c1 = Math.max(fr.colIdx, cr.colIdx);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const pair = getStudentSessionAt(r, c);
            if (pair) newSelected.add(getCellKey(pair.student.id, pair.session.id));
          }
        }
        setSelectedCells(newSelected);
      } else {
        setSelectedCells(new Set([cellKey]));
        setFocusedCell(cellKey);
      }
    },
    [focusedCell, getCellKey, findRowCol, getStudentSessionAt]
  );

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, width: '100%', minWidth: 0 }}>
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
        {saveStatus === 'saving' && (
          <Typography variant="body2" color="text.secondary">
            Đang lưu...
          </Typography>
        )}
        {saveStatus === 'error' && (
          <Typography variant="body2" color="error">
            {saveError}
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
      <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 2, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', width: '100%', minWidth: 0 }}>
          <FormControl sx={{ minWidth: 140 }}>
            <InputLabel>Lớp</InputLabel>
            <Select
              value={classId}
              label="Lớp"
              onChange={(e) => setClassId(e.target.value)}
              disabled={loading}
            >
              <MenuItem value="">Chọn lớp</MenuItem>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            type="date"
            label="Từ ngày"
            value={ngayHocGte}
            onChange={(e) => setNgayHocGte(e.target.value)}
            disabled={loading}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ width: 140 }}
          />
          <TextField
            type="date"
            label="Đến ngày"
            value={ngayHocLte}
            onChange={(e) => setNgayHocLte(e.target.value)}
            disabled={loading}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ width: 140 }}
          />
          <Button
            variant="contained"
            onClick={() => flushSave()}
            disabled={!hasPending || saveStatus === 'saving'}
          >
            Lưu
          </Button>
          <Button variant="outlined" onClick={() => setImportDialogOpen(true)}>
            Import điểm danh
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary">
          X=có mặt, B=bù, M=nghỉ phép, P=nghỉ · Ctrl+C/V · Del= all · Shift+Click=chọn vùng · Mũi tên=di chuyển · Ctrl+Alt+M=ghi chú
        </Typography>
      </Box>

      <Box sx={{ width: '100%', minWidth: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <AttendanceGrid
        rows={rows}
        sessionGroups={sessionGroups}
        loading={loading}
        getVal={getVal}
        getNote={getNote}
        setCellValue={setCellValue}
        getCellKey={getCellKey}
        selectedCells={selectedCells}
        focusedCell={focusedCell}
        setFocusedCell={setFocusedCell}
        setSelectedCells={setSelectedCells}
        setOpenDropdowns={setOpenDropdowns}
        cellRefs={cellRefs}
        focusedCellRef={focusedCellRef}
        onKeyDown={handleKeyDown}
        onCellClick={handleCellClick}
      />
      </Box>

      <AttendanceImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        classes={classes}
        onSuccess={load}
      />

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
              if (noteCell) setCellValue(noteCell.sid, noteCell.sessId, getVal(noteCell.sid, noteCell.sessId), noteValue);
              setNoteOpen(false);
              setNoteCell(null);
            }}
          >
            Lưu
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
