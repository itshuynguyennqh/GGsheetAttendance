import { useEffect, useMemo, useState } from 'react';
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
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { NavigateBefore, NavigateNext } from '@mui/icons-material';
import { classesApi, sessionsApi } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import SeatMapAttendanceDialog from '../components/SeatMapAttendanceDialog';
import { formatThangBuoiLabel as labelThangBuoi } from '../utils/formatThangBuoi';

export default function Sessions() {
  const [list, setList] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [form, setForm] = useState({ classId: '', ngayHoc: '', startTime: '19:00', noiDungHoc: '', enableAttendance: true });
  const [sortCol, setSortCol] = useState('ngayHoc');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [seatMapOpen, setSeatMapOpen] = useState(false);
  const [seatMapSessionId, setSeatMapSessionId] = useState(null);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir(col === 'ngayHoc' || col === 'lastEditAt' || col === 'id' ? 'desc' : 'asc');
    }
  };

  const sortedList = useMemo(() => {
    const rows = [...list];
    const dir = sortDir === 'asc' ? 1 : -1;
    const get = (row) => {
      switch (sortCol) {
        case 'id':
          return Number(row.id) || 0;
        case 'className':
          return String(row.className || '').toLowerCase();
        case 'ngayHoc':
          return row.ngayHoc ? new Date(row.ngayHoc).getTime() : 0;
        case 'startTime':
          return String(row.startTime || '');
        case 'thangBuoi':
          return labelThangBuoi(row.thang, row.buoi) || '';
        case 'noiDungHoc':
          return String(row.noiDungHoc || '').toLowerCase();
        case 'sourceType':
          return String(row.sourceType || '').toLowerCase();
        case 'enableAttendance':
          return row.enableAttendance ? 1 : 0;
        case 'lastEditAt':
          return row.lastEditAt ? new Date(row.lastEditAt).getTime() : 0;
        default:
          return 0;
      }
    };
    rows.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (sortCol === 'thangBuoi') {
        const c = String(va).localeCompare(String(vb));
        return dir * c;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return rows;
  }, [list, sortCol, sortDir]);

  const load = async () => {
    try {
      const params = {
        flat: 1,
        page,
        pageSize,
        ...(classFilter ? { classId: classFilter } : {}),
      };
      const [sessionsResult, classesData] = await Promise.all([sessionsApi.list(params), classesApi.list()]);
      setList(sessionsResult?.data ?? []);
      setTotal(sessionsResult?.total ?? 0);
      setClasses(classesData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [classFilter, pageSize]);

  useEffect(() => {
    load();
  }, [classFilter, page, pageSize]);

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

  const openSeatMap = (sessionId) => {
    setSeatMapSessionId(sessionId);
    setSeatMapOpen(true);
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
        <FormControl sx={{ minWidth: 100 }} size="small">
          <InputLabel>Số dòng</InputLabel>
          <Select
            label="Số dòng"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[25, 50, 100].map((n) => (
              <MenuItem key={n} value={n}>
                {n}/trang
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button
          size="small"
          startIcon={<NavigateBefore />}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Trang trước
        </Button>
        <Typography variant="body2" sx={{ minWidth: 140 }}>
          Trang {page} / {Math.max(1, Math.ceil(total / pageSize) || 1)}
        </Typography>
        <Button
          size="small"
          endIcon={<NavigateNext />}
          disabled={page >= Math.ceil(total / pageSize)}
          onClick={() => setPage((p) => p + 1)}
        >
          Trang sau
        </Button>
        <Typography variant="body2" color="text.secondary">
          Tổng {total} ca
        </Typography>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.light' }}>
              <TableCell sortDirection={sortCol === 'id' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'id'} direction={sortCol === 'id' ? sortDir : 'asc'} onClick={() => handleSort('id')}>
                  ID
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortCol === 'className' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'className'} direction={sortCol === 'className' ? sortDir : 'asc'} onClick={() => handleSort('className')}>
                  Lớp
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortCol === 'ngayHoc' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'ngayHoc'} direction={sortCol === 'ngayHoc' ? sortDir : 'asc'} onClick={() => handleSort('ngayHoc')}>
                  Ngày học
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortCol === 'startTime' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'startTime'} direction={sortCol === 'startTime' ? sortDir : 'asc'} onClick={() => handleSort('startTime')}>
                  Giờ
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortCol === 'thangBuoi' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'thangBuoi'} direction={sortCol === 'thangBuoi' ? sortDir : 'asc'} onClick={() => handleSort('thangBuoi')}>
                  Tháng-Buổi
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortCol === 'noiDungHoc' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'noiDungHoc'} direction={sortCol === 'noiDungHoc' ? sortDir : 'asc'} onClick={() => handleSort('noiDungHoc')}>
                  Nội dung
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortCol === 'sourceType' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'sourceType'} direction={sortCol === 'sourceType' ? sortDir : 'asc'} onClick={() => handleSort('sourceType')}>
                  Nguồn
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortCol === 'enableAttendance' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'enableAttendance'} direction={sortCol === 'enableAttendance' ? sortDir : 'asc'} onClick={() => handleSort('enableAttendance')}>
                  Điểm danh
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortCol === 'lastEditAt' ? sortDir : false}>
                <TableSortLabel active={sortCol === 'lastEditAt'} direction={sortCol === 'lastEditAt' ? sortDir : 'asc'} onClick={() => handleSort('lastEditAt')}>
                  Lần sửa cuối
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedList.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.className}</TableCell>
                <TableCell>{row.ngayHoc}</TableCell>
                <TableCell>{row.startTime}</TableCell>
                <TableCell>{labelThangBuoi(row.thang, row.buoi) || '—'}</TableCell>
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
                    <Button size="small" onClick={() => openSeatMap(row.id)} sx={{ mr: 0.5 }}>
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
      <SeatMapAttendanceDialog
        open={seatMapOpen}
        sessionId={seatMapSessionId}
        onClose={() => setSeatMapOpen(false)}
        onSaved={load}
      />
    </Box>
  );
}
