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

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ class_id: '', ma_hv: '', ho_ten: '', ten: '' });
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.students.list(filterClass || undefined), api.classes.list()])
      .then(([s, c]) => { setStudents(s); setClasses(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(load, [filterClass]);

  const handleSave = () => {
    if (!form.class_id || !form.ma_hv.trim() || !form.ho_ten.trim()) return;
    const body = { class_id: Number(form.class_id), ma_hv: form.ma_hv.trim(), ho_ten: form.ho_ten.trim(), ten: form.ten.trim() || null };
    (editId
      ? api.students.update(editId, body)
      : api.students.create(body)
    ).then(() => { setOpen(false); setEditId(null); setForm({ class_id: '', ma_hv: '', ho_ten: '', ten: '' }); load(); }).catch(console.error);
  };
  const handleEdit = (row) => {
    setEditId(row.id);
    setForm({ class_id: String(row.class_id), ma_hv: row.ma_hv, ho_ten: row.ho_ten, ten: row.ten || '' });
    setOpen(true);
  };
  const handleDeleteClick = (id) => setDeleteConfirm({ open: true, id });

  const handleDeleteConfirm = () => {
    const id = deleteConfirm.id;
    if (!id) return;
    api.students.delete(id).then(() => {
      setDeleteConfirm({ open: false, id: null });
      load();
    }).catch(console.error);
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>Học sinh</Typography>
      <FormControl size="small" sx={{ minWidth: 200, mr: 2, mb: 2 }}>
        <InputLabel>Lớp</InputLabel>
        <Select value={filterClass} label="Lớp" onChange={(e) => setFilterClass(e.target.value)}>
          <MenuItem value="">Tất cả</MenuItem>
          {classes.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
        </Select>
      </FormControl>
      <Button variant="contained" onClick={() => { setEditId(null); setForm({ class_id: filterClass || (classes[0]?.id ? String(classes[0].id) : ''), ma_hv: '', ho_ten: '', ten: '' }); setOpen(true); }} sx={{ mb: 2 }}>
        Thêm học sinh
      </Button>
      {loading ? <Typography>Đang tải...</Typography> : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Mã HV</TableCell>
              <TableCell>Họ tên</TableCell>
              <TableCell>Tên gọi</TableCell>
              <TableCell>Lớp</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.ma_hv}</TableCell>
                <TableCell>{row.ho_ten}</TableCell>
                <TableCell>{row.ten || '—'}</TableCell>
                <TableCell>{row.class_name || '—'}</TableCell>
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
        <DialogTitle>{editId ? 'Sửa học sinh' : 'Thêm học sinh'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Lớp</InputLabel>
            <Select value={form.class_id} label="Lớp" onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))}>
              {classes.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField margin="dense" label="Mã HV" fullWidth value={form.ma_hv} onChange={(e) => setForm((f) => ({ ...f, ma_hv: e.target.value }))} required />
          <TextField margin="dense" label="Họ tên" fullWidth value={form.ho_ten} onChange={(e) => setForm((f) => ({ ...f, ho_ten: e.target.value }))} required />
          <TextField margin="dense" label="Tên gọi" fullWidth value={form.ten} onChange={(e) => setForm((f) => ({ ...f, ten: e.target.value }))} />
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
        message="Xóa học sinh này?"
      />
    </>
  );
}
