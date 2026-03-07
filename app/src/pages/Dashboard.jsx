import { useEffect, useState } from 'react';
import {
  Box,
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
  Typography,
} from '@mui/material';
import { dashboardApi, classesApi } from '../api';

export default function Dashboard() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    classesApi.list().then(setClasses);
  }, []);

  useEffect(() => {
    if (!classId) {
      setData(null);
      return;
    }
    dashboardApi.streak({ classId }).then(setData);
  }, [classId]);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontFamily: 'Lora, serif' }}>
        Dashboard
      </Typography>
      <FormControl sx={{ minWidth: 140, mb: 2 }}>
        <InputLabel>Lớp</InputLabel>
        <Select value={classId} label="Lớp" onChange={(e) => setClassId(e.target.value)}>
          <MenuItem value="">Chọn lớp</MenuItem>
          {classes.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      {data && (
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Paper sx={{ p: 2, minWidth: 120 }}>
            <Typography variant="h4" color="success.main">{data.positiveStreak ?? 0}</Typography>
            <Typography variant="body2" color="text.secondary">Streak dương</Typography>
          </Paper>
          <Paper sx={{ p: 2, minWidth: 120 }}>
            <Typography variant="h4" color="error.main">{data.negativeStreak ?? 0}</Typography>
            <Typography variant="body2" color="text.secondary">Streak âm</Typography>
          </Paper>
        </Box>
      )}
      {data?.students?.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.light' }}>
                <TableCell>Mã HV</TableCell>
                <TableCell>Họ tên</TableCell>
                <TableCell align="right">Streak hiện tại</TableCell>
                <TableCell align="right">Max dương</TableCell>
                <TableCell align="right">Max âm</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.maHV}</TableCell>
                  <TableCell>{s.hoTen}</TableCell>
                  <TableCell align="right" sx={{ color: s.currentStreak >= 0 ? 'success.main' : 'error.main' }}>
                    {s.currentStreak}
                  </TableCell>
                  <TableCell align="right">{s.maxAttendStreak}</TableCell>
                  <TableCell align="right">{s.maxAbsenceStreak}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
