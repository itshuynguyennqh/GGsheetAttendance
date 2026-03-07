import React, { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import {
  parseExcelFile,
  parseHeaderMapping,
  parseAttendanceDataLongFormat,
  transformToImportFormat,
  formatPreviewData,
} from '../utils/attendanceImportParser';
import { downloadAttendanceImportTemplate } from '../utils/attendanceImportTemplate';
import { attendanceApi } from '../api';
import AttendanceImportPreview from './AttendanceImportPreview';

const steps = ['Chọn file Excel', 'Xem trước & xác nhận', 'Kết quả'];

export default function AttendanceImportDialog({ open, onClose, classes = [], onSuccess }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);

  const reset = useCallback(() => {
    setStep(0);
    setFile(null);
    setRows([]);
    setMapping(null);
    setParsedData([]);
    setValidationResult(null);
    setPreviewData([]);
    setSelectedRows(new Set());
    setFilterStatus('all');
    setSearchText('');
    setError('');
    setImportResult(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [reset, onClose]);

  const handleDownloadTemplate = useCallback(() => {
    downloadAttendanceImportTemplate();
  }, []);

  const handleFileChange = useCallback(
    async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setError('');
      setLoading(true);
      try {
        const rawRows = await parseExcelFile(f);
        if (!rawRows?.length) {
          setError('File không có dữ liệu.');
          setLoading(false);
          return;
        }
        const headers = rawRows[0].map((h) => h ?? '');
        const map = parseHeaderMapping(headers);
        if (!map || map.format !== 'long') {
          setError('File Excel phải có đúng 7 cột: Mã HV, Họ tên, Tên, Lớp, Tháng, Buổi, Điểm danh.');
          setLoading(false);
          return;
        }
        if (map.maHV < 0 && map.hoTen < 0) {
          setError('Không tìm thấy cột Mã HV hoặc Họ tên.');
          setLoading(false);
          return;
        }
        const parsed = parseAttendanceDataLongFormat(rawRows, map, classes);
        if (!parsed.length) {
          setError('Không có dòng dữ liệu hợp lệ.');
          setLoading(false);
          return;
        }
        const payload = transformToImportFormat(parsed);
        const result = await attendanceApi.validateImport({
          attendance: payload,
          options: { createSessionsIfNotExists: true, updateExisting: true },
        });
        const formatted = formatPreviewData(parsed, result);
        const validOrWarning = new Set(
          formatted.filter((r) => r.status === 'valid' || r.status === 'warning').map((r) => r.rowIndex)
        );
        setFile(f);
        setRows(rawRows);
        setMapping(map);
        setParsedData(parsed);
        setValidationResult(result);
        setPreviewData(formatted);
        setSelectedRows(validOrWarning);
        setStep(1);
      } catch (err) {
        setError(err.message || 'Lỗi xử lý file.');
      } finally {
        setLoading(false);
      }
    },
    [classes]
  );

  const handleSelectRow = useCallback((rowIndex, checked) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowIndex);
      else next.delete(rowIndex);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked, rowIndices) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (checked) rowIndices.forEach((i) => next.add(i));
      else rowIndices.forEach((i) => next.delete(i));
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    const toImport = parsedData.filter((row) => selectedRows.has(row.rowIndex));
    if (!toImport.length) {
      setError('Chọn ít nhất một dòng để import.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const payload = transformToImportFormat(toImport);
      const result = await attendanceApi.bulkImport({
        attendance: payload,
        options: { createSessionsIfNotExists: true, updateExisting: true },
      });
      setImportResult(result);
      attendanceApi.clearCache();
      onSuccess?.();
      setStep(2);
    } catch (err) {
      setError(err.message || 'Lỗi import.');
    } finally {
      setLoading(false);
    }
  }, [parsedData, selectedRows, onSuccess]);

  // Generate attendanceCols from parsedData if long format
  const attendanceCols = useMemo(() => {
    if (mapping?.format === 'long' && parsedData.length > 0) {
      const uniqueSessions = new Map();
      parsedData.forEach(row => {
        (row.records || []).forEach(rec => {
          if (rec.thang && rec.buoi != null) {
            const key = `${rec.thang}-${rec.buoi}`;
            if (!uniqueSessions.has(key)) {
              uniqueSessions.set(key, { thang: rec.thang, buoi: rec.buoi });
            }
          }
        });
      });
      const sortedSessions = Array.from(uniqueSessions.values()).sort((a, b) => {
        const [ya, ma] = a.thang.split('.').map(Number).reverse();
        const [yb, mb] = b.thang.split('.').map(Number).reverse();
        if (ya !== yb) return ya - yb;
        if (ma !== mb) return ma - mb;
        return a.buoi - b.buoi;
      });
      return sortedSessions.map((sess, idx) => ({
        colIndex: idx,
        thang: sess.thang,
        buoi: sess.buoi,
      }));
    }
    return mapping?.attendanceCols ?? [];
  }, [mapping, parsedData]);
  
  const summary = validationResult?.summary;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>Import điểm danh</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 2 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {step === 0 && (
          <Box sx={{ py: 2 }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Chọn file Excel có đúng 7 cột: Mã HV, Họ tên, Tên, Lớp, Tháng, Buổi, Điểm danh.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} disabled={loading}>
                Chọn file
                <input type="file" accept=".xlsx,.xls" hidden onChange={handleFileChange} />
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate}>
                Tải mẫu Excel
              </Button>
              {loading && <CircularProgress size={24} />}
            </Box>
          </Box>
        )}

        {step === 1 && summary && (
          <Box>
            <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2">
                Tổng: {summary.totalRows} dòng · Hợp lệ: {summary.validRows} · Lỗi: {summary.invalidRows} · Buổi: {summary.totalRecords} (mới: {summary.newRecords}, cập nhật: {summary.updateRecords})
              </Typography>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Trạng thái</InputLabel>
                <Select
                  value={filterStatus}
                  label="Trạng thái"
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <MenuItem value="all">Tất cả</MenuItem>
                  <MenuItem value="valid">Hợp lệ</MenuItem>
                  <MenuItem value="warning">Cảnh báo</MenuItem>
                  <MenuItem value="error">Lỗi</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="Tìm Mã HV, Họ tên..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                sx={{ width: 220 }}
              />
            </Box>
            <AttendanceImportPreview
              data={previewData}
              attendanceCols={attendanceCols}
              filterStatus={filterStatus}
              searchText={searchText}
              selectedRows={selectedRows}
              onSelectRow={handleSelectRow}
              onSelectAll={handleSelectAll}
              maxHeight={380}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Đã chọn {selectedRows.size} dòng. Chỉ dòng hợp lệ/cảnh báo sẽ được ghi vào hệ thống.
            </Typography>
          </Box>
        )}

        {step === 2 && importResult && (
          <Box sx={{ py: 2 }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              Import xong. Thành công: {importResult.summary?.inserted ?? 0} mới, {importResult.summary?.updated ?? 0} cập nhật.
              {importResult.errors?.length > 0 && ` Lỗi: ${importResult.errors.length}.`}
            </Alert>
            {importResult.errors?.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" fontWeight="medium" color="text.secondary" sx={{ mb: 1 }}>
                  Chi tiết lỗi:
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }}>
                  {(importResult.errors || []).map((e, idx) => {
                    const parts = [`Dòng ${e.rowIndex}`];
                    if (e.maHV) parts.push(e.maHV);
                    if (e.hoTen) parts.push(e.hoTen);
                    if (e.thang != null && e.buoi != null) parts.push(`Tháng ${e.thang}, Buổi ${e.buoi}`);
                    const prefix = parts.join(' - ');
                    return (
                      <Typography key={idx} component="li" variant="body2" sx={{ mb: 0.5 }}>
                        {prefix}: {e.error}
                      </Typography>
                    );
                  })}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {step === 0 && <Button onClick={handleClose}>Đóng</Button>}
        {step === 1 && (
          <>
            <Button onClick={() => setStep(0)}>Quay lại</Button>
            <Button variant="contained" onClick={handleImport} disabled={loading || selectedRows.size === 0}>
              {loading ? <CircularProgress size={20} /> : 'Import'}
            </Button>
          </>
        )}
        {step === 2 && (
          <Button variant="contained" onClick={handleClose}>
            Xong
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
