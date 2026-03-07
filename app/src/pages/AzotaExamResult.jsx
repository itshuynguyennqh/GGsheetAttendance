import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
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
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { azotaExamResultApi, classesApi } from '../api';
import * as XLSX from 'xlsx';

const SOURCE_TYPES = { class: 'class', paste: 'paste' };

export default function AzotaExamResult() {
  // #region agent log
  console.log('[DEBUG] AzotaExamResult component mounted');
  fetch('http://127.0.0.1:7244/ingest/620c0b57-0b89-4c67-a9b0-3e34c7b86c53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AzotaExamResult.jsx:component mount',message:'Component rendered',data:{pathname:window.location.pathname},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion agent log
  const [classes, setClasses] = useState([]);
  const [examId, setExamId] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [cookie, setCookie] = useState('');
  const [sourceType, setSourceType] = useState(SOURCE_TYPES.class);
  const [classId, setClassId] = useState('');
  const [pastedNames, setPastedNames] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [ocrServiceStatus, setOcrServiceStatus] = useState('checking');
  const [selectedSlotIndex, setSelectedSlotIndex] = useState('');
  const [savingRowIndex, setSavingRowIndex] = useState(null);
  const [saveSampleError, setSaveSampleError] = useState('');
  const [localResults, setLocalResults] = useState(null);

  useEffect(() => {
    classesApi.list().then(setClasses).catch(console.error);
    
    // Kiểm tra OCR service khi component mount
    const checkOcrService = async () => {
      try {
        const ocrServiceUrl = process.env.REACT_APP_OCR_SERVICE_URL || 'http://localhost:8000';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${ocrServiceUrl}/health`, { 
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          setOcrServiceStatus('ok');
        } else {
          setOcrServiceStatus('error');
        }
      } catch (e) {
        setOcrServiceStatus('error');
      }
    };
    checkOcrService();
  }, []);

  const getStudentNames = () => {
    if (sourceType === SOURCE_TYPES.paste) {
      return pastedNames
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const handleProcess = async () => {
    setError('');
    setResult(null);
    const token = (bearerToken || '').trim();
    const id = (examId || '').trim();
    if (!id || !token) {
      setError('Vui lòng nhập Exam ID và Bearer token.');
      return;
    }
    if (!/^\d+$/.test(id)) {
      setError('Exam ID phải là số (ví dụ: 12897293).');
      return;
    }
    if (sourceType === SOURCE_TYPES.class && !classId) {
      setError('Vui lòng chọn lớp.');
      return;
    }
    if (sourceType === SOURCE_TYPES.paste) {
      const names = getStudentNames();
      if (!names.length) {
        setError('Vui lòng dán ít nhất một tên (mỗi dòng một tên).');
        return;
      }
    }

    setLoading(true);
    try {
      const body = {
        examId: id,
        bearerToken: token,
        cookie: (cookie || '').trim() || undefined,
      };
      if (sourceType === SOURCE_TYPES.class) {
        body.classId = classId;
      } else {
        body.studentNames = getStudentNames();
      }
      if (selectedSlotIndex !== '' && selectedSlotIndex != null && !Number.isNaN(Number(selectedSlotIndex))) {
        body.slotIndex = Number(selectedSlotIndex);
      }
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/620c0b57-0b89-4c67-a9b0-3e34c7b86c53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AzotaExamResult.jsx:handleProcess',message:'Calling API',data:{examId:body.examId,hasClassId:!!body.classId,hasStudentNames:!!body.studentNames},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion agent log
      const data = await azotaExamResultApi.process(body);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/620c0b57-0b89-4c67-a9b0-3e34c7b86c53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AzotaExamResult.jsx:handleProcess',message:'API response received',data:{hasResult:!!data,resultKeys:data?Object.keys(data):[]},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion agent log
      setResult(data);
      setLocalResults(data?.results ? data.results.map((r) => ({ ...r })) : null);
    } catch (e) {
      const errorMsg = e?.message || 'Lỗi xử lý.';
      if (errorMsg.includes('OCR service không chạy') || errorMsg.includes('Match-names service không chạy')) {
        setError(
          errorMsg + '\n\n' +
          'Hướng dẫn khởi động OCR service:\n' +
          '1. Mở terminal mới\n' +
          '2. cd python/ocr-service\n' +
          '3. uvicorn main:app --reload --port 8000\n' +
          '4. Đợi service khởi động xong, sau đó thử lại'
        );
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSample = async (row, rowIndex) => {
    if (!row.studentId || !row.nameImageDataUrl || sourceType !== SOURCE_TYPES.class || !classId) return;
    const base64 = row.nameImageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    if (!base64) return;
    setSaveSampleError('');
    setSavingRowIndex(rowIndex);
    try {
      await azotaExamResultApi.saveHandwritingSample({
        studentId: row.studentId,
        classId,
        imageBase64: base64,
      });
      setSaveSampleError('');
    } catch (e) {
      setSaveSampleError(e?.message || 'Lỗi lưu mẫu.');
    } finally {
      setSavingRowIndex(null);
    }
  };

  const rows = (localResults ?? result?.results) || [];
  const classStudents = result?.classStudents || [];
  const unmatchedStudents = classStudents.filter((s) => !rows.some((r) => r.studentId === s.id));

  const assignStudentToRow = (rowIndex, student) => {
    if (!student || rowIndex < 0 || rowIndex >= rows.length) return;
    setLocalResults((prev) => {
      if (!prev?.length) return prev;
      return prev.map((r, i) => (i === rowIndex ? { ...r, studentId: student.id, studentName: student.hoTen || student.name } : r));
    });
  };

  const clearRowStudent = (rowIndex) => {
    if (rowIndex < 0 || rowIndex >= rows.length) return;
    setLocalResults((prev) => {
      if (!prev?.length) return prev;
      return prev.map((r, i) => (i === rowIndex ? { ...r, studentId: null, studentName: '' } : r));
    });
  };

  const handleDragStart = (e, payload) => {
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnRow = (e, targetRowIndex) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload.type === 'unmatched' && payload.id != null) {
        assignStudentToRow(targetRowIndex, { id: payload.id, hoTen: payload.hoTen });
      } else if (payload.type === 'row' && payload.rowIndex !== targetRowIndex) {
        const student = { id: payload.studentId, hoTen: payload.studentName };
        setLocalResults((prev) => {
          if (!prev?.length) return prev;
          const next = prev.map((r, i) => {
            if (i === targetRowIndex) return { ...r, studentId: student.id, studentName: student.hoTen };
            if (i === payload.rowIndex) return { ...r, studentId: null, studentName: '' };
            return r;
          });
          return next;
        });
      }
    } catch (_) {}
  };

  const handleDropOnUnmatched = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (payload.type === 'row' && payload.rowIndex != null) clearRowStudent(payload.rowIndex);
    } catch (_) {}
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  };
  const handleDragLeave = (e) => e.currentTarget.classList.remove('drag-over');

  const handleExportExcel = () => {
    const dataRows = rows.length ? rows : (result?.results || []);
    if (!result || !dataRows.length) return;
    const headers = ['Tên trong lớp', 'Điểm chấm', 'Tên đọc được (OCR)', 'Độ khớp (%)', 'Ảnh tên'];
    const excelRows = dataRows.map((r) => [
      r.studentName || '',
      r.mark != null ? String(r.mark) : '',
      r.recognizedName || '',
      r.score != null ? String(r.score) : '',
      r.nameImageDataUrl ? 'Có' : (r.nameImageUrl ? 'URL' : ''),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...excelRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Diem cham Azota');
    XLSX.writeFile(wb, 'diem-cham-azota.xlsx');
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontFamily: 'Lora, Georgia, serif' }}>
        Điểm chấm Azota
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Lấy kết quả chấm từ Azota theo Exam ID, OCR ảnh tên (nếu có), khớp với danh sách lớp. Cần Python OCR service chạy (port 8000).
      </Typography>
      
      {ocrServiceStatus === 'error' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            ⚠️ OCR Service chưa chạy
          </Typography>
          <Typography variant="body2" component="div">
            Vui lòng khởi động Python OCR service trước khi xử lý:
            <Box component="pre" sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.875rem', overflow: 'auto' }}>
{`cd python/ocr-service
uvicorn main:app --reload --port 8000`}
            </Box>
          </Typography>
        </Alert>
      )}
      
      {ocrServiceStatus === 'ok' && (
        <Alert severity="success" sx={{ mb: 2 }}>
          ✅ OCR Service đang chạy
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Thông tin Azota</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <TextField
            label="Exam ID"
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            placeholder="12897293"
            size="small"
            sx={{ minWidth: 160 }}
          />
          <TextField
            label="Bearer token"
            type="password"
            value={bearerToken}
            onChange={(e) => setBearerToken(e.target.value)}
            placeholder="JWT token từ DevTools"
            size="small"
            sx={{ minWidth: 280 }}
          />
          <TextField
            label="Cookie (tùy chọn)"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder="Nếu API trả HTML"
            size="small"
            sx={{ minWidth: 200 }}
          />
        </Box>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Nguồn danh sách học sinh</Typography>
        <FormControl size="small" sx={{ minWidth: 200, mr: 2, mb: 1 }}>
          <InputLabel>Nguồn</InputLabel>
          <Select
            value={sourceType}
            label="Nguồn"
            onChange={(e) => setSourceType(e.target.value)}
          >
            <MenuItem value={SOURCE_TYPES.class}>Chọn lớp</MenuItem>
            <MenuItem value={SOURCE_TYPES.paste}>Dán danh sách tên</MenuItem>
          </Select>
        </FormControl>
        {sourceType === SOURCE_TYPES.class && (
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel>Lớp</InputLabel>
            <Select
              value={classId}
              label="Lớp"
              onChange={(e) => setClassId(e.target.value)}
            >
              <MenuItem value="">— Chọn lớp —</MenuItem>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {sourceType === SOURCE_TYPES.paste && (
          <TextField
            multiline
            minRows={3}
            maxRows={8}
            label="Danh sách tên (mỗi dòng một tên)"
            value={pastedNames}
            onChange={(e) => setPastedNames(e.target.value)}
            placeholder={'Nguyễn Văn A\nTrần Thị B'}
            size="small"
            fullWidth
            sx={{ mt: 1 }}
          />
        )}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        startIcon={<PlayArrowIcon />}
        onClick={handleProcess}
        disabled={loading}
        sx={{ mb: 2 }}
      >
        Lấy và xử lý
      </Button>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {result && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            {result.message}
          </Alert>
          {result.timeSlots && result.timeSlots.length > 0 && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Ưu tiên khớp theo cửa sổ thời gian (30 phút)</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <FormControl size="small" sx={{ minWidth: 280 }}>
                  <InputLabel>Cửa sổ ưu tiên</InputLabel>
                  <Select
                    value={selectedSlotIndex}
                    label="Cửa sổ ưu tiên"
                    onChange={(e) => setSelectedSlotIndex(e.target.value)}
                  >
                    <MenuItem value="">— Không ưu tiên —</MenuItem>
                    {result.timeSlots.map((slot, idx) => {
                      const start = slot.start ? new Date(slot.start) : null;
                      const end = slot.end ? new Date(slot.end) : null;
                      const label = start && end
                        ? `${start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} (${slot.count || slot.indices?.length || 0} bài)`
                        : `Cửa sổ ${idx + 1} (${slot.count || slot.indices?.length || 0} bài)`;
                      return (
                        <MenuItem key={idx} value={idx}>
                          {label}
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  onClick={handleProcess}
                  disabled={loading || selectedSlotIndex === ''}
                >
                  Xử lý lại với ưu tiên cửa sổ
                </Button>
              </Box>
            </Paper>
          )}
          {saveSampleError && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setSaveSampleError('')}>
              {saveSampleError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button startIcon={<DownloadIcon />} onClick={handleExportExcel}>
              Xuất Excel
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table size="small" sx={{ '& .drag-over': { bgcolor: 'action.hover' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Ảnh tên (OCR)</TableCell>
                  <TableCell>Tên trong lớp</TableCell>
                  <TableCell>Điểm chấm</TableCell>
                  <TableCell>Tên đọc được (OCR)</TableCell>
                  <TableCell align="right">Độ khớp (%)</TableCell>
                  {sourceType === SOURCE_TYPES.class && classId && (
                    <TableCell>Thao tác</TableCell>
                  )}
                  {classStudents.length > 0 && (
                    <TableCell sx={{ minWidth: 160 }}>Tên chưa khớp (kéo thả)</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell sx={{ verticalAlign: 'middle' }}>
                      {row.nameImageDataUrl ? (
                        <img
                          src={row.nameImageDataUrl}
                          alt="Ảnh tên đưa vào OCR"
                          title="Ảnh crop tên đã đưa qua OCR"
                          style={{ maxHeight: 56, maxWidth: 120, objectFit: 'contain', display: 'block' }}
                        />
                      ) : row.nameImageUrl ? (
                        <Typography variant="caption" color="text.secondary">Có URL (chưa tải ảnh)</Typography>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell
                      draggable={!!row.studentId}
                      onDragStart={(e) => row.studentId && handleDragStart(e, { type: 'row', rowIndex: idx, studentId: row.studentId, studentName: row.studentName })}
                      onDrop={(e) => handleDropOnRow(e, idx)}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      sx={{
                        cursor: row.studentId ? 'grab' : 'default',
                        verticalAlign: 'middle',
                        minWidth: 140,
                        border: '1px dashed transparent',
                        borderRadius: 1,
                        '&:active': row.studentId ? { cursor: 'grabbing' } : {},
                      }}
                      title={row.studentId ? 'Kéo để đổi chỗ hoặc bỏ vào cột bên phải' : 'Thả tên từ cột bên phải vào đây'}
                    >
                      {row.studentName || '—'}
                      {row.matchFallback && (
                        <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 0.5 }} title="Khớp gần (độ tương đồng dưới ngưỡng chuẩn)">
                          (gần)
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.mark != null ? row.mark : '—'}</TableCell>
                    <TableCell>{row.recognizedName || '—'}</TableCell>
                    <TableCell align="right">{row.score != null ? row.score : '—'}</TableCell>
                    {sourceType === SOURCE_TYPES.class && classId && (
                      <TableCell>
                        {row.studentId && row.nameImageDataUrl ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleSaveSample(row, idx)}
                            disabled={savingRowIndex !== null}
                          >
                            {savingRowIndex === idx ? 'Đang lưu...' : 'Lưu mẫu chữ'}
                          </Button>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    )}
                    {classStudents.length > 0 && idx === 0 && (
                      <TableCell
                        rowSpan={rows.length}
                        onDrop={handleDropOnUnmatched}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        sx={{
                          verticalAlign: 'top',
                          minWidth: 160,
                          maxWidth: 220,
                          border: '1px dashed',
                          borderColor: 'divider',
                          borderRadius: 1,
                          bgcolor: 'grey.50',
                          p: 1,
                        }}
                        title="Thả tên từ dòng vào đây để bỏ khớp"
                      >
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Chưa khớp — kéo vào dòng để gán
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {unmatchedStudents.map((s) => (
                            <Chip
                              key={s.id}
                              label={s.hoTen || s.name || `#${s.id}`}
                              size="small"
                              draggable
                              onDragStart={(e) => handleDragStart(e, { type: 'unmatched', id: s.id, hoTen: s.hoTen || s.name })}
                              sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
                            />
                          ))}
                          {unmatchedStudents.length === 0 && (
                            <Typography variant="caption" color="text.secondary">Đã khớp hết</Typography>
                          )}
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}
