import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { classesApi, coursesApi } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

const DAY_NAMES = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function Classes() {
  const [list, setList] = useState([]);
  const [courses, setCourses] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [form, setForm] = useState({ courseId: '', name: '' });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleClassId, setScheduleClassId] = useState(null);
  const [scheduleList, setScheduleList] = useState([]);
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');

  const load = async () => {
    try {
      const [classesData, coursesData] = await Promise.all([
        classesApi.list(),
        coursesApi.list(),
      ]);
      setList(classesData);
      setCourses(coursesData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, []);

  const handleOpen = (row = null) => {
    if (row) {
      setEditId(row.id);
      setForm({ courseId: row.courseId, name: row.name });
    } else {
      setEditId(null);
      setForm({ courseId: courses[0]?.id || '', name: '' });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editId) {
        await classesApi.update(editId, form);
      } else {
        await classesApi.create(form);
      }
      setOpen(false);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDeleteClick = (id) => setDeleteConfirm({ open: true, id });

  const handleDeleteConfirm = async () => {
    const id = deleteConfirm.id;
    if (!id) return;
    try {
      await classesApi.delete(id);
      setDeleteConfirm({ open: false, id: null });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const getCourseName = (id) => courses.find((c) => c.id === id)?.name || '—';

  const openSchedule = async (row) => {
    setScheduleClassId(row.id);
    try {
      const data = await classesApi.getSchedule(row.id);
      setScheduleList(data);
    } catch (e) {
      console.error(e);
    }
    const d = new Date();
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    setGenStart(`${y}-${String(m).padStart(2, '0')}-01`);
    setGenEnd(d.toISOString().slice(0, 10));
    setScheduleOpen(true);
  };

  const addScheduleSlot = async () => {
    if (!scheduleClassId) return;
    try {
      await classesApi.addSchedule(scheduleClassId, { dayOfWeek: 1, startTime: '19:00' });
      const data = await classesApi.getSchedule(scheduleClassId);
      setScheduleList(data);
    } catch (e) {
      alert(e.message);
    }
  };

  const generateSessions = async () => {
    if (!scheduleClassId || !genStart || !genEnd) {
      alert('Chọn khoảng thời gian');
      return;
    }
    try {
      const r = await classesApi.generateSessions(scheduleClassId, { startDate: genStart, endDate: genEnd });
      alert(`Đã tạo ${r.created} ca học`);
      setScheduleOpen(false);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontFamily: 'Lora, serif' }}>
        Lớp học
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} disabled={courses.length === 0}>
          Thêm lớp
        </Button>
        {courses.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
            Tạo khóa học trước
          </Typography>
        )}
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.light' }}>
              <TableCell>ID</TableCell>
              <TableCell>Khóa học</TableCell>
              <TableCell>Tên lớp</TableCell>
              <TableCell>Lần sửa cuối</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{getCourseName(row.courseId)}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.lastEditAt ? new Date(row.lastEditAt).toLocaleString('vi-VN') : '—'}</TableCell>
                <TableCell align="right">
                  <Button size="small" startIcon={<CalendarMonthIcon />} onClick={() => openSchedule(row)}>
                    Lịch học
                  </Button>
                  <IconButton size="small" onClick={() => handleOpen(row)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDeleteClick(row.id)}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Sửa lớp' : 'Thêm lớp'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Khóa học</InputLabel>
            <Select
              value={form.courseId}
              label="Khóa học"
              onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            >
              {courses.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            margin="dense"
            label="Tên lớp"
            fullWidth
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: 9.1, 9.2"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleSave}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Lịch lặp lại mỗi tuần</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Các slot trong tuần. Sinh ca từ lịch để tạo các ca học trong khoảng thời gian.
          </Typography>
          <TableContainer sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Thứ</TableCell>
                  <TableCell>Giờ</TableCell>
                  <TableCell>Nội dung</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scheduleList.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{DAY_NAMES[s.dayOfWeek]}</TableCell>
                    <TableCell>{s.startTime}</TableCell>
                    <TableCell>{s.noiDungHoc || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Button size="small" onClick={addScheduleSlot}>Thêm slot</Button>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Sinh ca từ lịch</Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField type="date" size="small" label="Từ" value={genStart} onChange={(e) => setGenStart(e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField type="date" size="small" label="Đến" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} InputLabelProps={{ shrink: true }} />
              <Button variant="contained" onClick={generateSessions}>Sinh ca</Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, id: null })}
        onConfirm={handleDeleteConfirm}
        title="Xác nhận xóa"
        message="Xóa lớp này?"
      />
    </Box>
  );
}
