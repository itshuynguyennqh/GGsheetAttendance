import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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

export default function CoursesPage() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', azota_class_id: '' });
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.courses.list().then(setList).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSave = () => {
    const body = { name: form.name.trim(), azota_class_id: form.azota_class_id.trim() || null };
    (editId
      ? api.courses.update(editId, body)
      : api.courses.create(body)
    ).then(() => { setOpen(false); setEditId(null); setForm({ name: '', azota_class_id: '' }); load(); }).catch(console.error);
  };
  const handleEdit = (row) => {
    setEditId(row.id);
    setForm({ name: row.name, azota_class_id: row.azota_class_id || '' });
    setOpen(true);
  };
  const handleDeleteClick = (id) => setDeleteConfirm({ open: true, id });

  const handleDeleteConfirm = () => {
    const id = deleteConfirm.id;
    if (!id) return;
    api.courses.delete(id).then(() => {
      setDeleteConfirm({ open: false, id: null });
      load();
    }).catch(console.error);
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>Khóa học</Typography>
      <Button variant="contained" onClick={() => { setEditId(null); setForm({ name: '', azota_class_id: '' }); setOpen(true); }} sx={{ mb: 2 }}>
        Thêm khóa học
      </Button>
      {loading ? <Typography>Đang tải...</Typography> : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Tên</TableCell>
              <TableCell>Azota class ID</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.azota_class_id || '—'}</TableCell>
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
        <DialogTitle>{editId ? 'Sửa khóa học' : 'Thêm khóa học'}</DialogTitle>
        <DialogContent>
          <TextField autoFocus margin="dense" label="Tên" fullWidth value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextField margin="dense" label="Azota class ID" fullWidth value={form.azota_class_id} onChange={(e) => setForm((f) => ({ ...f, azota_class_id: e.target.value }))} />
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
        message="Xóa khóa học này?"
      />
    </>
  );
}
