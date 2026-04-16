import { useState, useCallback, useEffect, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Button, Stack, Typography, Select, MenuItem, FormControl,
  InputLabel, CircularProgress, Alert, Chip, IconButton, Tooltip, Snackbar,
  ToggleButton, ToggleButtonGroup, Paper, TextField, Link,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import RouteIcon from '@mui/icons-material/Route';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import EditNoteIcon from '@mui/icons-material/EditNote';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import SmartSeatGrid from '../components/scm/SmartSeatGrid';
import LayoutConfigDialog from '../components/scm/LayoutConfigDialog';
import BatchAssignDialog from '../components/scm/BatchAssignDialog';
import StudentNoteSheet from '../components/scm/StudentNoteSheet';
import VoiceNoteButton from '../components/scm/VoiceNoteButton';
import ImageImportDialog from '../components/scm/ImageImportDialog';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { useSCM } from '../hooks/useSCM';
import { usePathSelection } from '../hooks/usePathSelection';
import { classesApi, sessionsApi, studentsApi } from '../api';
import { hasAttendanceRecord } from '../utils/attendanceRecord';

export default function SCM() {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [mode, setMode] = useState('assign');
  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const [pickedStudentId, setPickedStudentId] = useState(null);
  const [swapFirst, setSwapFirst] = useState(null);

  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [noteStudent, setNoteStudent] = useState(null);
  const [imageImportOpen, setImageImportOpen] = useState(false);
  const [attendanceTarget, setAttendanceTarget] = useState(null);
  const [guestQuery, setGuestQuery] = useState('');
  const [guestSearchResults, setGuestSearchResults] = useState([]);
  const [guestSearchLoading, setGuestSearchLoading] = useState(false);

  const scm = useSCM({ sessionId: selectedSessionId || null });

  const transferHints = useMemo(
    () => scm.students.filter(
      (s) => s.transferSuggestion?.suggestTransfer
        && Number(s.classId) !== Number(scm.session?.classId),
    ),
    [scm.students, scm.session?.classId],
  );

  const pathHook = usePathSelection({
    rows: scm.grid.rows,
    cols: scm.grid.cols,
    seatAssignments: scm.seatAssignments,
    disabledSeats: scm.grid.disabledSeats || [],
  });

  const pickedStudent = pickedStudentId != null ? scm.studentById.get(Number(pickedStudentId)) : null;

  useEffect(() => {
    let cancelled = false;
    setLoadingClasses(true);
    classesApi.list().then((data) => {
      if (!cancelled) setClasses(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (!cancelled) setClasses([]);
    }).finally(() => {
      if (!cancelled) setLoadingClasses(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedClassId) {
      setSessions([]);
      setSelectedSessionId('');
      return;
    }
    let cancelled = false;
    setLoadingSessions(true);
    setSelectedSessionId('');
    sessionsApi.list({ classId: selectedClassId, flat: 1, pageSize: 100 }).then((result) => {
      if (!cancelled) setSessions(Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : []);
    }).catch(() => {
      if (!cancelled) setSessions([]);
    }).finally(() => {
      if (!cancelled) setLoadingSessions(false);
    });
    return () => { cancelled = true; };
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedSessionId || !scm.session?.classId) {
      setGuestSearchResults([]);
      return;
    }
    const q = guestQuery.trim();
    if (q.length < 1) {
      setGuestSearchResults([]);
      setGuestSearchLoading(false);
      return;
    }
    let cancelled = false;
    setGuestSearchLoading(true);
    const t = setTimeout(() => {
      studentsApi
        .list({ q, excludeClassId: scm.session.classId, limit: 30 })
        .then((rows) => {
          if (!cancelled) setGuestSearchResults(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          if (!cancelled) setGuestSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setGuestSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [guestQuery, selectedSessionId, scm.session?.classId]);

  const pendingGuestIds = useMemo(
    () => scm.guestStudentIds.filter((id) => !scm.seatByStudent.has(id)),
    [scm.guestStudentIds, scm.seatByStudent],
  );

  const handleSeatTap = useCallback(({ row, col, student }) => {
    const seatKey = `${row}-${col}`;

    if (mode === 'assign') {
      if (pickedStudentId != null) {
        if (student && Number(student.id) === Number(pickedStudentId)) {
          setPickedStudentId(null);
        } else {
          scm.assignStudentToSeat(pickedStudentId, seatKey);
          const name = pickedStudent?.hoTen || pickedStudent?.name || '';
          setSnack({ open: true, message: `Đã gán ${name} vào R${row + 1}C${col + 1}`, severity: 'success' });
          setPickedStudentId(null);
        }
      } else if (student) {
        setPickedStudentId(student.id);
      }
    } else if (mode === 'swap') {
      if (!student) return;
      if (!swapFirst) {
        setSwapFirst({ seatKey, student });
      } else if (swapFirst.seatKey === seatKey) {
        setSwapFirst(null);
      } else {
        scm.assignStudentToSeat(swapFirst.student.id, seatKey);
        scm.assignStudentToSeat(student.id, swapFirst.seatKey);
        setSnack({
          open: true,
          message: `Đã đổi chỗ ${swapFirst.student.hoTen || swapFirst.student.name} ↔ ${student.hoTen || student.name}`,
          severity: 'success',
        });
        setSwapFirst(null);
      }
    } else if (mode === 'note') {
      if (student) {
        setNoteStudent(student);
      }
    } else if (mode === 'attendance') {
      if (student) {
        setAttendanceTarget(student);
      }
    }
  }, [mode, pickedStudentId, pickedStudent, scm, swapFirst]);

  const handlePoolStudentTap = useCallback((student) => {
    if (pickedStudentId === student.id) {
      setPickedStudentId(null);
    } else {
      setPickedStudentId(student.id);
    }
  }, [pickedStudentId]);

  const handleRemoveFromSeat = useCallback((studentId) => {
    const seatKey = scm.seatByStudent.get(Number(studentId));
    if (seatKey) {
      scm.moveSeatToPool(seatKey);
      if (pickedStudentId === studentId) setPickedStudentId(null);
    }
  }, [scm, pickedStudentId]);

  const handleModeChange = useCallback((_, newMode) => {
    if (newMode !== null) {
      setMode(newMode);
      setPickedStudentId(null);
      setSwapFirst(null);
      setAttendanceTarget(null);
      if (newMode !== 'path') {
        pathHook.clearSelection();
      }
    }
  }, [pathHook]);

  const handleBatchConfirm = useCallback((assignments) => {
    scm.batchAssign(assignments);
    pathHook.clearSelection();
    setSnack({ open: true, message: `Đã gán ${assignments.length} học sinh!`, severity: 'success' });
  }, [scm, pathHook]);

  const handleImageImportConfirm = useCallback((assignments) => {
    scm.batchAssign(assignments);
    setSnack({ open: true, message: `Đã gán ${assignments.length} chỗ ngồi từ ảnh!`, severity: 'success' });
  }, [scm]);

  const handlePathConfirm = useCallback(() => {
    if (pathHook.selectedPath.length > 0) {
      setBatchDialogOpen(true);
    }
  }, [pathHook.selectedPath]);

  const handleSave = useCallback(async () => {
    try {
      await scm.save();
      setSnack({ open: true, message: 'Đã lưu sơ đồ chỗ ngồi!', severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Lỗi khi lưu. Vui lòng thử lại.', severity: 'error' });
    }
  }, [scm]);

  const handleAttendancePick = useCallback(async (letter) => {
    if (!attendanceTarget) return;
    try {
      await scm.putSessionAttendance({ studentId: attendanceTarget.id, value: letter });
      setAttendanceTarget(null);
      setSnack({ open: true, message: `Đã lưu điểm danh ${letter}`, severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Không lưu được điểm danh', severity: 'error' });
    }
  }, [attendanceTarget, scm]);

  const handleAttendanceClear = useCallback(async () => {
    if (!attendanceTarget) return;
    try {
      await scm.putSessionAttendance({ studentId: attendanceTarget.id, clear: true });
      setAttendanceTarget(null);
      setSnack({ open: true, message: 'Đã xóa điểm danh', severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Không xóa được điểm danh', severity: 'error' });
    }
  }, [attendanceTarget, scm]);

  const handleClearAll = useCallback(() => {
    scm.clearAllSeats();
    setPickedStudentId(null);
    setSwapFirst(null);
    setSnack({ open: true, message: 'Đã xóa tất cả chỗ ngồi', severity: 'info' });
  }, [scm]);

  const handleLayoutSaved = useCallback((result) => {
    if (result?.rows && result?.cols) {
      scm.setGrid((prev) => ({ ...prev, rows: result.rows, cols: result.cols }));
    }
    setSnack({ open: true, message: 'Đã cập nhật cấu hình phòng học!', severity: 'success' });
  }, [scm]);

  const gridPickedId = mode === 'assign' ? pickedStudentId
    : mode === 'swap' ? (swapFirst?.student?.id ?? null)
    : null;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%' }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Sơ đồ lớp học
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems="flex-end">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Lớp học</InputLabel>
          <Select
            value={selectedClassId}
            label="Lớp học"
            onChange={(e) => setSelectedClassId(e.target.value)}
            disabled={loadingClasses}
          >
            <MenuItem value="">-- Chọn lớp --</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name || `Lớp ${c.id}`}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Ca học</InputLabel>
          <Select
            value={selectedSessionId}
            label="Ca học"
            onChange={(e) => setSelectedSessionId(e.target.value)}
            disabled={!selectedClassId || loadingSessions}
          >
            <MenuItem value="">-- Chọn ca --</MenuItem>
            {sessions.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.ngayHoc || ''} {s.startTime || ''}{s.thang && s.buoi ? ` · T${s.thang} B${s.buoi}` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {(loadingClasses || loadingSessions) && <CircularProgress size={24} />}
      </Stack>

      {scm.error && <Alert severity="error" sx={{ mb: 2 }}>{scm.error}</Alert>}

      {selectedSessionId && (
        <>
          {transferHints.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Gợi ý xem xét chuyển lớp (≥3 buổi liên tiếp tại lớp này)
              </Typography>
              <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
                {transferHints.map((s) => (
                  <Typography key={s.id} component="li" variant="body2">
                    {s.hoTen || s.name}
                    {s.className ? ` — lớp ${s.className}` : ''}
                    {s.transferSuggestion?.streakLength != null
                      ? ` (${s.transferSuggestion.streakLength} buổi liên tiếp)`
                      : ''}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          )}

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Học viên lớp khác tham gia ca
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ mb: 1 }}
            alignItems={{ sm: 'center' }}
          >
            <TextField
              size="small"
              label="Tìm theo tên / mã HV"
              value={guestQuery}
              onChange={(e) => setGuestQuery(e.target.value)}
              sx={{ minWidth: 260 }}
              placeholder="Gõ để tìm (lớp hiện tại đã loại trừ)"
            />
            <Link component={RouterLink} to="/students" variant="body2" sx={{ whiteSpace: 'nowrap' }}>
              Quản lý danh sách học viên
            </Link>
          </Stack>
          {guestQuery.trim().length > 0 && (
            <Paper variant="outlined" sx={{ p: 1, mb: 2, maxHeight: 220, overflow: 'auto' }}>
              {guestSearchLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                  <CircularProgress size={22} />
                </Box>
              ) : guestSearchResults.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Không tìm thấy</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {guestSearchResults.map((s) => (
                    <Button
                      key={s.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => {
                        scm.addGuestStudent(s);
                        setGuestQuery('');
                        setGuestSearchResults([]);
                      }}
                    >
                      {s.hoTen || s.name}
                      {s.className ? ` · ${s.className}` : ''}
                    </Button>
                  ))}
                </Stack>
              )}
            </Paper>
          )}
          {pendingGuestIds.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
              {pendingGuestIds.map((id) => {
                const s = scm.studentById.get(id);
                return (
                  <Tooltip key={id} title="Chưa xếp ghế — có thể xóa khỏi ca">
                    <Chip
                      label={s ? `${s.hoTen || s.name} (khách)` : `Học viên #${id}`}
                      color="secondary"
                      size="small"
                      onDelete={() => scm.removeGuestStudent(id)}
                    />
                  </Tooltip>
                );
              })}
            </Stack>
          )}

          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }} alignItems="center">
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={handleModeChange}
              size="small"
            >
              <ToggleButton value="assign" sx={{ minHeight: 44, gap: 0.5 }}>
                <PersonAddIcon fontSize="small" />
                <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Gán chỗ</Typography>
              </ToggleButton>
              <ToggleButton value="swap" sx={{ minHeight: 44, gap: 0.5 }}>
                <SwapHorizIcon fontSize="small" />
                <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Đổi chỗ</Typography>
              </ToggleButton>
              <ToggleButton value="note" sx={{ minHeight: 44, gap: 0.5 }}>
                <EditNoteIcon fontSize="small" />
                <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Nhận xét</Typography>
              </ToggleButton>
              <ToggleButton value="attendance" sx={{ minHeight: 44, gap: 0.5 }}>
                <FactCheckIcon fontSize="small" />
                <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Điểm danh</Typography>
              </ToggleButton>
              <ToggleButton value="path" sx={{ minHeight: 44, gap: 0.5 }}>
                <RouteIcon fontSize="small" />
                <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Kéo chọn</Typography>
              </ToggleButton>
            </ToggleButtonGroup>

            <Tooltip title="Nhập từ ảnh viết tay">
              <IconButton
                onClick={() => setImageImportOpen(true)}
                color="secondary"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <CameraAltIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Cấu hình sơ đồ">
              <IconButton
                onClick={() => setLayoutDialogOpen(true)}
                disabled={!selectedClassId}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Xóa tất cả chỗ ngồi">
              <IconButton
                onClick={handleClearAll}
                color="warning"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <DeleteSweepIcon />
              </IconButton>
            </Tooltip>

            <Box sx={{ flex: 1 }} />

            <Button
              variant="contained"
              startIcon={scm.saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={handleSave}
              disabled={scm.saving || !scm.dirty}
              sx={{ minHeight: 44 }}
            >
              Lưu{scm.dirty ? ' *' : ''}
            </Button>
          </Stack>

          {mode === 'assign' && pickedStudent && (
            <Paper
              elevation={3}
              sx={{
                mb: 2, px: 2, py: 1.5,
                display: 'flex', alignItems: 'center', gap: 1.5,
                bgcolor: 'primary.50', border: '2px solid', borderColor: 'primary.main',
                borderRadius: 2,
              }}
            >
              <PersonIcon color="primary" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Đang chọn: {pickedStudent.hoTen || pickedStudent.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Chạm vào ghế trống để gán · Chạm ghế có người để đổi chỗ
                </Typography>
              </Box>
              <Tooltip title="Ghi chú">
                <IconButton size="small" color="info" onClick={() => { setNoteStudent(pickedStudent); setPickedStudentId(null); }}>
                  <StickyNote2Icon fontSize="small" />
                </IconButton>
              </Tooltip>
              {scm.seatByStudent.has(Number(pickedStudentId)) && (
                <Tooltip title="Gỡ khỏi ghế">
                  <IconButton size="small" color="warning" onClick={() => handleRemoveFromSeat(pickedStudentId)}>
                    <SwapHorizIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Bỏ chọn">
                <IconButton size="small" onClick={() => setPickedStudentId(null)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Paper>
          )}

          {mode === 'swap' && swapFirst && (
            <Paper
              elevation={3}
              sx={{
                mb: 2, px: 2, py: 1.5,
                display: 'flex', alignItems: 'center', gap: 1.5,
                bgcolor: 'warning.50', border: '2px solid', borderColor: 'warning.main',
                borderRadius: 2,
              }}
            >
              <SwapHorizIcon color="warning" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Đang chọn: {swapFirst.student.hoTen || swapFirst.student.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Chạm ghế khác để đổi chỗ
                </Typography>
              </Box>
              <Tooltip title="Bỏ chọn">
                <IconButton size="small" onClick={() => setSwapFirst(null)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Paper>
          )}

          {mode === 'swap' && !swapFirst && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Chạm ghế có học sinh để bắt đầu đổi chỗ
            </Typography>
          )}

          {mode === 'note' && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Chạm ghế có học sinh để ghi nhận xét
            </Typography>
          )}

          {mode === 'attendance' && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Chạm ghế có học sinh để chọn X / B / M / P (đồng bộ với trang Điểm danh)
            </Typography>
          )}

          {mode === 'path' && pathHook.selectedPath.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }} action={
              <Stack direction="row" spacing={1}>
                <Button size="small" color="primary" variant="contained" onClick={handlePathConfirm}>
                  Gán tên ({pathHook.selectedPath.length})
                </Button>
                <Button size="small" onClick={pathHook.clearSelection}>Bỏ chọn</Button>
              </Stack>
            }>
              Đã chọn {pathHook.selectedPath.length} ghế theo đường kéo. Nhấn "Gán tên" để khớp tên hàng loạt.
            </Alert>
          )}

          {scm.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Box sx={{ position: 'relative' }}>
                <SmartSeatGrid
                  rows={scm.grid.rows}
                  cols={scm.grid.cols}
                  disabledSeats={scm.grid.disabledSeats}
                  seatAssignments={scm.seatAssignments}
                  studentById={scm.studentById}
                  seatStatuses={scm.seatStatuses}
                  attendanceByStudentId={scm.attendanceByStudentId}
                  pathSelection={mode === 'path' ? pathHook.selectedPath : []}
                  pickedStudentId={gridPickedId}
                  onSeatTap={handleSeatTap}
                />
                {mode === 'path' && (
                  <Box
                    ref={pathHook.gridRef}
                    onPointerDown={pathHook.handlePointerDown}
                    onPointerMove={pathHook.handlePointerMove}
                    onPointerUp={pathHook.handlePointerUp}
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 10,
                      cursor: pathHook.isSelecting ? 'crosshair' : 'cell',
                      touchAction: 'none',
                    }}
                  />
                )}
              </Box>

              {mode === 'assign' && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                    Học viên chưa xếp chỗ ({scm.unassignedStudents.length})
                  </Typography>
                  <Box
                    sx={{
                      p: 1.5,
                      border: '2px dashed',
                      borderColor: 'grey.300',
                      borderRadius: 2,
                      bgcolor: 'grey.50',
                      minHeight: 48,
                    }}
                  >
                    {scm.unassignedStudents.length === 0 ? (
                      <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>
                        Tất cả học viên đã được xếp chỗ
                      </Typography>
                    ) : (
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        {scm.unassignedStudents.map((s) => {
                          const attRec = scm.attendanceByStudentId[Number(s.id)];
                          const attMarked = hasAttendanceRecord(attRec);
                          const attVal = String(attRec?.value || '').trim().toUpperCase();
                          return (
                            <Chip
                              key={s.id}
                              label={
                                attVal
                                  ? `${s.hoTen || s.name || `HV ${s.id}`} · ${attVal}`
                                  : (attMarked
                                    ? `${s.hoTen || s.name || `HV ${s.id}`} · ✓`
                                    : (s.hoTen || s.name || `HV ${s.id}`))
                              }
                              size="small"
                              color={
                                pickedStudentId === s.id ? 'primary'
                                  : attMarked ? 'success'
                                  : 'default'
                              }
                              variant={pickedStudentId === s.id ? 'filled' : 'outlined'}
                              onClick={() => handlePoolStudentTap(s)}
                              sx={{
                                cursor: 'pointer',
                                minHeight: 36,
                                fontWeight: pickedStudentId === s.id || attMarked ? 700 : 400,
                                boxShadow: pickedStudentId === s.id ? 3 : 0,
                                transition: 'all 0.15s ease',
                                '&:active': { transform: 'scale(0.95)' },
                              }}
                            />
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                </>
              )}
            </>
          )}
        </>
      )}

      {!selectedSessionId && !scm.loading && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography variant="h6">Chọn lớp và ca học để xem sơ đồ</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Chạm chọn học viên, rồi chạm vào ghế để gán chỗ ngồi.
          </Typography>
        </Box>
      )}

      <LayoutConfigDialog
        open={layoutDialogOpen}
        classId={selectedClassId}
        currentGrid={scm.grid}
        onClose={() => setLayoutDialogOpen(false)}
        onSaved={handleLayoutSaved}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        message={snack.message}
      />

      <BatchAssignDialog
        open={batchDialogOpen}
        selectedSeats={pathHook.selectedPath}
        availableStudents={scm.unassignedStudents}
        onConfirm={handleBatchConfirm}
        onClose={() => setBatchDialogOpen(false)}
      />

      <StudentNoteSheet
        open={!!noteStudent}
        student={noteStudent}
        sessionId={selectedSessionId}
        onClose={() => setNoteStudent(null)}
      />

      <Dialog
        open={!!attendanceTarget}
        onClose={() => setAttendanceTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pr: 5 }}>
          Điểm danh — {attendanceTarget?.hoTen || attendanceTarget?.name || 'Học viên'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            Cùng dữ liệu với lưới trang Điểm danh (ca học hiện tại)
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {['X', 'B', 'M', 'P'].map((letter) => (
              <Button
                key={letter}
                variant="contained"
                size="medium"
                color={letter === 'X' ? 'success' : letter === 'P' ? 'error' : 'primary'}
                onClick={() => handleAttendancePick(letter)}
                sx={{ minWidth: 52, fontWeight: 700 }}
              >
                {letter}
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="warning" onClick={handleAttendanceClear}>
            Xóa ô
          </Button>
          <Button onClick={() => setAttendanceTarget(null)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <ImageImportDialog
        open={imageImportOpen}
        onClose={() => setImageImportOpen(false)}
        allStudents={[...scm.studentById.values()]}
        gridRows={scm.grid.rows}
        gridCols={scm.grid.cols}
        onConfirm={handleImageImportConfirm}
      />

      {selectedSessionId && (
        <VoiceNoteButton
          students={[...scm.studentById.values()]}
          sessionId={selectedSessionId}
          onNoteAdded={(count) => {
            setSnack({ open: true, message: `Đã lưu ${count} nhận xét bằng giọng nói`, severity: 'success' });
          }}
        />
      )}
    </Box>
  );
}
