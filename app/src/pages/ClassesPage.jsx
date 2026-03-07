import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ course_id: '', name: '' });
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.classes.list(), api.courses.list()])
      .then(([c, co]) => { setClasses(c); setCourses(co); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSave = () => {
    if (!form.course_id || !form.name.trim()) return;
    const body = { course_id: Number(form.course_id), name: form.name.trim() };
    (editId
      ? api.classes.update(editId, body)
      : api.classes.create(body)
    ).then(() => { setOpen(false); setEditId(null); setForm({ course_id: '', name: '' }); load(); }).catch(console.error);
  };
  const handleEdit = (row) => {
    setEditId(row.id);
    setForm({ course_id: String(row.course_id), name: row.name });
    setOpen(true);
  };
  const handleDeleteClick = (id) => setDeleteConfirm({ open: true, id });

  const handleDeleteConfirm = () => {
    const id = deleteConfirm.id;
    if (!id) return;
    api.classes.delete(id).then(() => {
      setDeleteConfirm({ open: false, id: null });
      load();
    }).catch(console.error);
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>Lớp học</Typography>
      <Button variant="contained" onClick={() => { setEditId(null); setForm({ course_id: courses[0]?.id ? String(courses[0].id) : '', name: '' }); setOpen(true); }} sx={{ mb: 2 }}>
        Thêm lớp
      </Button>
      {loading ? <Typography>Đang tải...</Typography> : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Khóa học</TableCell>
              <TableCell>Tên lớp</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {classes.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.course_name || '—'}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => handleEdit(row)}>Sửa</Button>
                  <Button size="small" color="error" onClick={() => handleDeleteClick(row.id)}>Xóa</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Sửa lớp' : 'Thêm lớp'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Khóa học</InputLabel>
            <Select value={form.course_id} label="Khóa học" onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}>
              {courses.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField margin="dense" label="Tên lớp" fullWidth value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
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
        message="Xóa lớp này?"
      />
    </>
  );
}
