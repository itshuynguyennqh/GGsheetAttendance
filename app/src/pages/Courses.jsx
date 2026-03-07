import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
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
import { coursesApi } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Courses() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [form, setForm] = useState({ name: '', azotaClassId: '' });

  const load = async () => {
    try {
      const data = await coursesApi.list();
      setList(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, []);

  const handleOpen = (row = null) => {
    if (row) {
      setEditId(row.id);
      setForm({ name: row.name, azotaClassId: row.azotaClassId || '' });
    } else {
      setEditId(null);
      setForm({ name: '', azotaClassId: '' });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editId) {
        await coursesApi.update(editId, form);
      } else {
        await coursesApi.create(form);
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
      await coursesApi.delete(id);
      setDeleteConfirm({ open: false, id: null });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontFamily: 'Lora, serif' }}>
        Khóa học
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          Thêm khóa học
        </Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.light' }}>
              <TableCell>ID</TableCell>
              <TableCell>Tên</TableCell>
              <TableCell>Azota Class ID</TableCell>
              <TableCell>Lần sửa cuối</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.azotaClassId || '—'}</TableCell>
                <TableCell>{row.lastEditAt ? new Date(row.lastEditAt).toLocaleString('vi-VN') : '—'}</TableCell>
                <TableCell align="right">
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
        <DialogTitle>{editId ? 'Sửa khóa học' : 'Thêm khóa học'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Tên khóa học"
            fullWidth
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Azota Class ID"
            fullWidth
            value={form.azotaClassId}
            onChange={(e) => setForm({ ...form, azotaClassId: e.target.value })}
            placeholder="Để trống nếu chưa gắn"
          />
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
    </Box>
  );
}
