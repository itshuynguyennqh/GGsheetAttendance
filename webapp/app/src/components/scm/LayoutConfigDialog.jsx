import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography, Alert,
} from '@mui/material';
import { layoutApi } from '../../api';

export default function LayoutConfigDialog({ open, classId, currentGrid, onClose, onSaved }) {
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && currentGrid) {
      setRows(currentGrid.rows || 4);
      setCols(currentGrid.cols || 7);
      setError('');
    }
  }, [open, currentGrid]);

  const handleSave = async () => {
    if (rows < 1 || rows > 20 || cols < 1 || cols > 20) {
      setError('Số hàng/cột phải từ 1-20');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await layoutApi.save(classId, { rows, cols });
      onSaved?.(result);
      onClose?.();
    } catch (e) {
      setError(e.message || 'Lỗi khi lưu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Cấu hình sơ đồ phòng học</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Thiết lập số hàng và cột cho sơ đồ chỗ ngồi của lớp.
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Số hàng"
            type="number"
            value={rows}
            onChange={(e) => setRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            slotProps={{ htmlInput: { min: 1, max: 20 } }}
            fullWidth
          />
          <TextField
            label="Số cột"
            type="number"
            value={cols}
            onChange={(e) => setCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            slotProps={{ htmlInput: { min: 1, max: 20 } }}
            fullWidth
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Tổng: {rows * cols} ghế
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
