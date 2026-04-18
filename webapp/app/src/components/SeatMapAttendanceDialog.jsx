import { memo, useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import SeatMapGrid from './SeatMapGrid';
import SeatMapStudentPool from './SeatMapStudentPool';
import { useSeatMapAttendance } from '../hooks/useSeatMapAttendance';

const DraggableStudentChip = memo(function DraggableStudentChip({ student, source, onEdit, feedback }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `student-${student.id}-${source}`,
    data: { type: 'student', studentId: Number(student.id), source },
  });
  const chipStyle = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
    width: '100%',
  };
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', width: '100%', minHeight: 32 }}>
      <Chip
        ref={setNodeRef}
        label={student.hoTen || student.name || `HV ${student.id}`}
        size="small"
        style={chipStyle}
        {...listeners}
        {...attributes}
        sx={{
          width: '100%',
          justifyContent: 'space-between',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />
      {source !== 'pool' && (
        <Tooltip title={feedback?.comment || feedback?.score ? 'Sửa nhận xét/điểm' : 'Thêm nhận xét/điểm'}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit?.(student);
            }}
            sx={{
              position: 'absolute',
              right: -8,
              top: -8,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              width: 18,
              height: 18,
            }}
          >
            <AddCircleOutlineIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
});

export default function SeatMapAttendanceDialog({ open, sessionId, onClose, onSaved }) {
  const {
    loading,
    saving,
    error,
    session,
    grid,
    seatAssignments,
    feedbackByStudent,
    studentById,
    unassignedStudents,
    dirty,
    assignStudentToSeat,
    moveSeatToPool,
    updateFeedback,
    save,
  } = useSeatMapAttendance({ open, sessionId });
  const [activeStudent, setActiveStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const assignedCount = useMemo(
    () => Object.keys(seatAssignments).filter((k) => seatAssignments[k]?.studentId != null).length,
    [seatAssignments]
  );

  const handleDragStart = useCallback((e) => {
    const sid = Number(e.active?.data?.current?.studentId);
    if (!Number.isFinite(sid)) return;
    setActiveStudent(studentById.get(sid) || null);
  }, [studentById]);

  const handleDragEnd = useCallback((e) => {
    setActiveStudent(null);
    const sid = Number(e.active?.data?.current?.studentId);
    const overId = String(e.over?.id || '');
    if (!Number.isFinite(sid) || !overId) return;
    if (overId === 'pool') {
      const source = String(e.active?.data?.current?.source || '');
      if (source.startsWith('seat-')) moveSeatToPool(source.replace('seat-', ''));
      return;
    }
    if (overId.startsWith('seat-')) {
      assignStudentToSeat(sid, overId.replace('seat-', ''));
    }
  }, [assignStudentToSeat, moveSeatToPool]);

  const handleDragCancel = useCallback(() => {
    setActiveStudent(null);
  }, []);

  const openFeedback = useCallback((student) => {
    setEditingStudent(student);
    const current = feedbackByStudent[String(student.id)] || {};
    setScore(current.score ?? '');
    setComment(current.comment ?? '');
  }, [feedbackByStudent]);

  const closeWithGuard = () => {
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Đóng dialog?')) return;
    onClose?.();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={closeWithGuard}
        maxWidth="xl"
        fullWidth
        slotProps={{
          paper: {
            sx: { overflow: 'visible' },
          },
        }}
      >
        <DialogTitle>
          Điểm danh sơ đồ chỗ ngồi
          {session ? ` · ${session.className || ''} · ${session.ngayHoc || ''} ${session.startTime || ''}` : ''}
        </DialogTitle>
        <DialogContent sx={{ overflow: 'visible' }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SeatMapGrid
                rows={grid.rows}
                cols={grid.cols}
                renderSeat={(seatKey, row, col) => {
                  const seat = seatAssignments[seatKey];
                  const student = seat?.studentId != null ? studentById.get(Number(seat.studentId)) : null;
                  return (
                    <Stack spacing={0.5} sx={{ width: '100%' }}>
                      <Typography variant="caption" color="text.secondary">R{row + 1}C{col + 1}</Typography>
                      {student ? (
                        <DraggableStudentChip
                          student={student}
                          source={`seat-${seatKey}`}
                          feedback={feedbackByStudent[String(student.id)]}
                          onEdit={openFeedback}
                        />
                      ) : (
                        <Typography variant="caption" color="text.disabled">Trống</Typography>
                      )}
                    </Stack>
                  );
                }}
              />
              <SeatMapStudentPool
                students={unassignedStudents}
                renderStudent={(student) => (
                  <Box key={student.id} sx={{ minWidth: 140 }}>
                    <DraggableStudentChip student={student} source="pool" />
                  </Box>
                )}
              />
              <DragOverlay
                dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}
                style={{ cursor: 'grabbing', zIndex: 2000 }}
              >
                {activeStudent ? (
                  <Chip
                    label={activeStudent.hoTen || activeStudent.name || `HV ${activeStudent.id}`}
                    size="small"
                    sx={{
                      boxShadow: 6,
                      opacity: 0.98,
                      transform: 'translateZ(0)',
                      maxWidth: 220,
                    }}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Đã xếp: {assignedCount}/{grid.rows * grid.cols} ghế
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeWithGuard}>Hủy</Button>
          <Button
            variant="contained"
            disabled={loading || saving}
            onClick={async () => {
              await save();
              onSaved?.();
              onClose?.();
            }}
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editingStudent} onClose={() => setEditingStudent(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Nhận xét / điểm
          {editingStudent ? ` · ${editingStudent.hoTen || editingStudent.name}` : ''}
        </DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Điểm"
            fullWidth
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="VD: 8.5"
          />
          <TextField
            margin="dense"
            label="Nhận xét"
            fullWidth
            multiline
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingStudent(null)}>Hủy</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (editingStudent) updateFeedback(editingStudent.id, { score, comment });
              setEditingStudent(null);
            }}
          >
            Lưu
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

