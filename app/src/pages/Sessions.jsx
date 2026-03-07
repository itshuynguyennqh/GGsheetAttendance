import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  IconButton,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
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
import AssignmentIcon from '@mui/icons-material/Assignment';
import { Link } from 'react-router-dom';
import { classesApi, sessionsApi } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Sessions() {
  const [list, setList] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [form, setForm] = useState({ classId: '', ngayHoc: '', startTime: '19:00', noiDungHoc: '', enableAttendance: true });

  const load = async () => {
    try {
      const [sessionsResult, classesData] = await Promise.all([
        sessionsApi.list(classFilter ? { classId: classFilter } : {}),
        classesApi.list(),
      ]);
      setList(sessionsResult?.data ?? sessionsResult ?? []);
      setClasses(classesData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, [classFilter]);

  const handleOpen = (row = null) => {
    if (row) {
      setEditId(row.id);
      setForm({
        classId: row.classId,
        ngayHoc: row.ngayHoc?.slice(0, 10) || '',
        startTime: row.startTime || '19:00',
        noiDungHoc: row.noiDungHoc || '',
        enableAttendance: row.enableAttendance !== 0,
      });
    } else {
      setEditId(null);
      setForm({
        classId: classes[0]?.id || '',
        ngayHoc: new Date().toISOString().slice(0, 10),
        startTime: '19:00',
        noiDungHoc: '',
        enableAttendance: true,
      });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editId) {
        await sessionsApi.update(editId, {
          ngayHoc: form.ngayHoc,
          startTime: form.startTime,
          noiDungHoc: form.noiDungHoc,
          enableAttendance: form.enableAttendance ? 1 : 0,
        });
      } else {
        await sessionsApi.create({
          classId: form.classId,
          ngayHoc: form.ngayHoc,
          startTime: form.startTime,
          noiDungHoc: form.noiDungHoc,
          enableAttendance: form.enableAttendance ? 1 : 0,
        });
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
      await sessionsApi.delete(id);
      setDeleteConfirm({ open: false, id: null });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontFamily: 'Lora, serif' }}>
        Ca học
      </Typography>
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: 140 }}>
          <InputLabel>Lớp</InputLabel>
          <Select value={classFilter} label="Lớp" onChange={(e) => setClassFilter(e.target.value)}>
            <MenuItem value="">Tất cả</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} disabled={classes.length === 0}>
          Thêm ca thủ công
        </Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.light' }}>
              <TableCell>ID</TableCell>
              <TableCell>Lớp</TableCell>
              <TableCell>Ngày học</TableCell>
              <TableCell>Giờ</TableCell>
              <TableCell>Tháng-Buổi</TableCell>
              <TableCell>Nội dung</TableCell>
              <TableCell>Nguồn</TableCell>
              <TableCell>Điểm danh</TableCell>
              <TableCell>Lần sửa cuối</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.className}</TableCell>
                <TableCell>{row.ngayHoc}</TableCell>
                <TableCell>{row.startTime}</TableCell>
                <TableCell>{row.thang ? `${row.thang}-B${row.buoi || '?'}` : '—'}</TableCell>
                <TableCell>{row.noiDungHoc || '—'}</TableCell>
                <TableCell>
                  <Chip label={row.sourceType || 'manual'} size="small" color={row.sourceType === 'template' ? 'success' : 'default'} />
                </TableCell>
                <TableCell>
                  <Chip label={row.enableAttendance ? 'Có' : 'Không'} size="small" color={row.enableAttendance ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{row.lastEditAt ? new Date(row.lastEditAt).toLocaleString('vi-VN') : '—'}</TableCell>
                <TableCell align="right">
                  {row.enableAttendance && (
                    <Button size="small" component={Link} to={`/attendance?sessionId=${row.id}&classId=${row.classId}`} sx={{ mr: 0.5 }}>
                      Điểm danh
                    </Button>
                  )}
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
        <DialogTitle>{editId ? 'Sửa ca học' : 'Thêm ca thủ công'}</DialogTitle>
        <DialogContent>
          {!editId && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Lớp</InputLabel>
              <Select
                value={form.classId}
                label="Lớp"
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
              >
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            margin="dense"
            label="Ngày học"
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={form.ngayHoc}
            onChange={(e) => setForm({ ...form, ngayHoc: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Giờ"
            type="time"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Nội dung"
            fullWidth
            value={form.noiDungHoc}
            onChange={(e) => setForm({ ...form, noiDungHoc: e.target.value })}
          />
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <input
              type="checkbox"
              id="enableAtt"
              checked={form.enableAttendance}
              onChange={(e) => setForm({ ...form, enableAttendance: e.target.checked })}
            />
            <label htmlFor="enableAtt">Có điểm danh</label>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleSave}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, id: null })}
        onConfirm={handleDeleteConfirm}
        title="Xác nhận xóa"
        message="Xóa ca học này?"
      />
    </Box>
  );
}
