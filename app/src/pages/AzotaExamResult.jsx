import { useEffect, useState, useMemo } from 'react';
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
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { azotaExamResultApi, classesApi } from '../api';
import * as XLSX from 'xlsx';

function scoreColor(score) {
  if (score == null || score <= 0) return 'error.main';
  if (score >= 90) return 'success.main';
  if (score >= 75) return 'success.light';
  if (score >= 60) return 'warning.main';
  return 'error.main';
}

function scoreBg(score) {
  if (score == null || score <= 0) return 'error.lighter';
  if (score >= 90) return undefined;
  if (score >= 75) return undefined;
  if (score >= 60) return 'warning.lighter';
  return 'error.lighter';
}

function DraggableName({ id, data, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
    touchAction: 'none',
  };
  return (
    <span ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </span>
  );
}

function DroppableCell({ id, data, children, isEmpty }) {
  const { isOver, setNodeRef } = useDroppable({ id, data });
  return (
    <TableCell
      ref={setNodeRef}
      sx={{
        verticalAlign: 'middle',
        minWidth: 140,
        transition: 'background-color 0.15s, border-color 0.15s',
        bgcolor: isOver ? 'primary.lighter' : undefined,
        border: isEmpty ? '2px dashed' : '1px dashed transparent',
        borderColor: isOver ? 'primary.main' : isEmpty ? 'grey.300' : 'transparent',
        borderRadius: 1,
      }}
    >
      {children}
    </TableCell>
  );
}

function DroppableSidebar({ children }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'sidebar-unmatched', data: { type: 'sidebar' } });
  return (
    <Paper
      ref={setNodeRef}
      elevation={0}
      sx={{
        p: 1.5,
        minWidth: 180,
        maxWidth: 240,
        maxHeight: 600,
        overflowY: 'auto',
        border: '2px dashed',
        borderColor: isOver ? 'warning.main' : 'grey.300',
        bgcolor: isOver ? 'warning.lighter' : 'grey.50',
        borderRadius: 2,
        transition: 'border-color 0.15s, background-color 0.15s',
        flexShrink: 0,
      }}
    >
      {children}
    </Paper>
  );
}

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
  const [vlmServiceStatus, setVlmServiceStatus] = useState('checking');
  const [activeEngine, setActiveEngine] = useState(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState('');
  const [savingRowIndex, setSavingRowIndex] = useState(null);
  const [saveSampleError, setSaveSampleError] = useState('');
  const [localResults, setLocalResults] = useState(null);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    classesApi.list().then(setClasses).catch(console.error);
    
    const checkService = async (url, setStatus) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${url}/health`, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          setStatus('ok');
          return data.engine || null;
        }
        setStatus('error');
      } catch {
        setStatus('error');
      }
      return null;
    };
    const checkServices = async () => {
      const [ocrEngine, vlmEngine] = await Promise.all([
        checkService('http://localhost:8000', setOcrServiceStatus),
        checkService('http://localhost:8001', setVlmServiceStatus),
      ]);
      // VLM service trả engine: "gemini" | "gemma" | "openvino", vẫn tính là VLM
      const useVlm = vlmEngine === 'vlm' || vlmEngine === 'gemini' || vlmEngine === 'gemma' || vlmEngine === 'openvino';
      setActiveEngine(useVlm ? 'vlm' : ocrEngine ? 'ocr' : null);
    };
    checkServices();
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
      if (errorMsg.includes('không chạy') || errorMsg.includes('không thể kết nối')) {
        setError(
          errorMsg + '\n\n' +
          'Hướng dẫn khởi động:\n' +
          '• OCR: cd python/ocr-service && uvicorn main:app --reload --port 8000\n' +
          '• VLM: cd python/vlm-service && .\\run.ps1\n' +
          'Đợi service khởi động xong, sau đó thử lại.'
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
  const allStudentNames = result?.studentNames || [];

  const unmatchedStudents = useMemo(() => {
    const assignedNames = new Set(rows.filter((r) => r.studentName).map((r) => r.studentName));
    if (classStudents.length > 0) {
      return classStudents.filter((s) => !rows.some((r) => r.studentId === s.id));
    }
    if (allStudentNames.length > 0) {
      return allStudentNames
        .map((name, idx) => ({ id: `name-${idx}`, hoTen: name }))
        .filter((s) => !assignedNames.has(s.hoTen));
    }
    return [];
  }, [rows, classStudents, allStudentNames]);

  const [activeDrag, setActiveDrag] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDndDragStart = (event) => {
    setActiveDrag(event.active.data.current || null);
  };

  const handleDndDragEnd = (event) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over || !active.data.current) return;
    const src = active.data.current;
    const dst = over.data.current;

    if (dst?.type === 'sidebar') {
      if (src.type === 'row' && src.rowIndex != null) {
        setLocalResults((prev) => {
          if (!prev?.length) return prev;
          return prev.map((r, i) => (i === src.rowIndex ? { ...r, studentId: null, studentName: '' } : r));
        });
      }
      return;
    }

    if (dst?.type === 'cell' && dst.rowIndex != null) {
      const targetIdx = dst.rowIndex;
      if (src.type === 'unmatched') {
        setLocalResults((prev) => {
          if (!prev?.length) return prev;
          return prev.map((r, i) => {
            if (i !== targetIdx) return r;
            return { ...r, studentId: src.id, studentName: src.hoTen };
          });
        });
      } else if (src.type === 'row' && src.rowIndex !== targetIdx) {
        setLocalResults((prev) => {
          if (!prev?.length) return prev;
          const srcRow = prev[src.rowIndex];
          const dstRow = prev[targetIdx];
          return prev.map((r, i) => {
            if (i === targetIdx) return { ...r, studentId: srcRow.studentId || srcRow.studentName, studentName: srcRow.studentName };
            if (i === src.rowIndex) return { ...r, studentId: dstRow.studentId || dstRow.studentName, studentName: dstRow.studentName };
            return r;
          });
        });
      }
    }
  };

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

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sortedIndices = (() => {
    const indices = rows.map((_, i) => i);
    if (!sortCol) return indices;
    const getValue = (row) => {
      switch (sortCol) {
        case 'studentName': return (row.studentName || '').toLowerCase();
        case 'mark': return row.mark != null ? parseFloat(row.mark) || 0 : -1;
        case 'recognizedName': return (row.recognizedName || '').toLowerCase();
        case 'score': return row.score != null ? Number(row.score) : -1;
        case 'hasImage': return row.nameImageDataUrl ? 1 : 0;
        default: return 0;
      }
    };
    indices.sort((a, b) => {
      const va = getValue(rows[a]);
      const vb = getValue(rows[b]);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return indices;
  })();

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontFamily: 'Lora, Georgia, serif' }}>
        Điểm chấm Azota
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Lấy kết quả chấm từ Azota theo Exam ID, OCR ảnh tên (nếu có), khớp với danh sách lớp. Cần Python OCR service chạy (port 8000).
      </Typography>
      
      {ocrServiceStatus === 'error' && vlmServiceStatus === 'error' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            OCR / VLM Service chưa chạy
          </Typography>
          <Typography variant="body2" component="div">
            Khởi động ít nhất một service trước khi xử lý:
            <Box component="pre" sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.875rem', overflow: 'auto' }}>
{`# OCR (EasyOCR/PaddleOCR):
cd python/ocr-service && uvicorn main:app --reload --port 8000

# VLM / Gemini (port 8001):
cd python/vlm-service && set VLM_ENGINE=gemini && set GEMINI_API_KEY=your-key && .\\run.ps1`}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Để ảnh được gửi tới Gemini: khởi động server Node với <strong>OCR_ENGINE_MODE=vlm</strong> (thêm vào .env hoặc: <code>set OCR_ENGINE_MODE=vlm</code> rồi chạy npm run dev).
            </Typography>
          </Typography>
        </Alert>
      )}

      {(ocrServiceStatus === 'ok' || vlmServiceStatus === 'ok') && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {ocrServiceStatus === 'ok' && vlmServiceStatus === 'ok'
            ? 'OCR Service (port 8000) + VLM Service (port 8001) đang chạy'
            : ocrServiceStatus === 'ok'
              ? 'OCR Service đang chạy (port 8000)'
              : 'VLM Service đang chạy (port 8001)'}
          {activeEngine && (
            <Typography component="span" variant="body2" sx={{ ml: 1, fontWeight: 'bold' }}>
              — Engine: {activeEngine.toUpperCase()}
            </Typography>
          )}
          {activeEngine === 'vlm' && (
            <Typography component="div" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Để ảnh được gửi tới Gemini/VLM, cần khởi động server Node với biến môi trường OCR_ENGINE_MODE=vlm (ví dụ trong .env hoặc: set OCR_ENGINE_MODE=vlm &amp;&amp; npm run dev).
            </Typography>
          )}
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
          <DndContext sensors={sensors} onDragStart={handleDndDragStart} onDragEnd={handleDndDragEnd}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TableContainer component={Paper} sx={{ flex: 1, minWidth: 0 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sortDirection={sortCol === 'hasImage' ? sortDir : false}>
                        <TableSortLabel active={sortCol === 'hasImage'} direction={sortCol === 'hasImage' ? sortDir : 'asc'} onClick={() => handleSort('hasImage')}>
                          Ảnh tên
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sortDirection={sortCol === 'studentName' ? sortDir : false}>
                        <TableSortLabel active={sortCol === 'studentName'} direction={sortCol === 'studentName' ? sortDir : 'asc'} onClick={() => handleSort('studentName')}>
                          Tên trong lớp
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sortDirection={sortCol === 'mark' ? sortDir : false}>
                        <TableSortLabel active={sortCol === 'mark'} direction={sortCol === 'mark' ? sortDir : 'asc'} onClick={() => handleSort('mark')}>
                          Điểm chấm
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sortDirection={sortCol === 'recognizedName' ? sortDir : false}>
                        <TableSortLabel active={sortCol === 'recognizedName'} direction={sortCol === 'recognizedName' ? sortDir : 'asc'} onClick={() => handleSort('recognizedName')}>
                          Tên đọc được
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right" sortDirection={sortCol === 'score' ? sortDir : false}>
                        <TableSortLabel active={sortCol === 'score'} direction={sortCol === 'score' ? sortDir : 'asc'} onClick={() => handleSort('score')}>
                          Độ khớp
                        </TableSortLabel>
                      </TableCell>
                      {sourceType === SOURCE_TYPES.class && classId && (
                        <TableCell>Thao tác</TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedIndices.map((origIdx) => {
                      const row = rows[origIdx];
                      const hasName = !!(row.studentId || row.studentName);
                      const isEmpty = !hasName;
                      const canDrag = hasName;
                      return (
                        <TableRow
                          key={origIdx}
                          sx={{
                            bgcolor: isEmpty ? 'action.hover' : scoreBg(row.score),
                            '&:hover': { bgcolor: isEmpty ? 'action.selected' : undefined },
                          }}
                        >
                          <TableCell sx={{ verticalAlign: 'middle' }}>
                            {row.nameImageDataUrl ? (
                              <img
                                src={row.nameImageDataUrl}
                                alt="Ảnh tên"
                                style={{ maxHeight: 56, maxWidth: 120, objectFit: 'contain', display: 'block' }}
                              />
                            ) : row.nameImageUrl ? (
                              <Typography variant="caption" color="text.secondary">URL</Typography>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <DroppableCell
                            id={`cell-${origIdx}`}
                            data={{ type: 'cell', rowIndex: origIdx }}
                            isEmpty={isEmpty}
                          >
                            {hasName ? (
                              <DraggableName
                                id={`row-${origIdx}`}
                                data={{ type: 'row', rowIndex: origIdx, studentId: row.studentId || row.studentName, studentName: row.studentName }}
                              >
                                <Chip
                                  label={row.studentName}
                                  size="small"
                                  color={row.matchFallback ? 'warning' : 'primary'}
                                  variant={row.matchFallback ? 'outlined' : 'filled'}
                                  sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
                                />
                              </DraggableName>
                            ) : (
                              <Typography variant="body2" color="text.disabled">—</Typography>
                            )}
                          </DroppableCell>
                          <TableCell>{row.mark != null ? row.mark : '—'}</TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 140 }} title={row.recognizedName || ''}>
                              {row.recognizedName || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {row.score != null && row.score > 0 ? (
                              <Typography variant="body2" sx={{ fontWeight: 600, color: scoreColor(row.score) }}>
                                {row.score}
                              </Typography>
                            ) : (
                              <Typography variant="body2" color="text.disabled">—</Typography>
                            )}
                          </TableCell>
                          {sourceType === SOURCE_TYPES.class && classId && (
                            <TableCell>
                              {row.studentId && row.nameImageDataUrl ? (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleSaveSample(row, origIdx)}
                                  disabled={savingRowIndex !== null}
                                >
                                  {savingRowIndex === origIdx ? 'Đang lưu...' : 'Lưu mẫu'}
                                </Button>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {(classStudents.length > 0 || allStudentNames.length > 0) && (
                <DroppableSidebar>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '0.8rem' }}>
                    Chưa khớp ({unmatchedStudents.length})
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Kéo tên vào cột "Tên trong lớp"
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {unmatchedStudents.map((s) => (
                      <DraggableName
                        key={s.id}
                        id={`unmatched-${s.id}`}
                        data={{ type: 'unmatched', id: s.id, hoTen: s.hoTen }}
                      >
                        <Chip
                          label={s.hoTen || `#${s.id}`}
                          size="small"
                          variant="outlined"
                          sx={{
                            cursor: 'grab',
                            width: '100%',
                            justifyContent: 'flex-start',
                            '&:active': { cursor: 'grabbing' },
                          }}
                        />
                      </DraggableName>
                    ))}
                    {unmatchedStudents.length === 0 && (
                      <Typography variant="caption" color="success.main" sx={{ textAlign: 'center', py: 1 }}>
                        Khớp hết!
                      </Typography>
                    )}
                  </Box>
                </DroppableSidebar>
              )}
            </Box>

            <DragOverlay dropAnimation={null}>
              {activeDrag && (
                <Chip
                  label={activeDrag.hoTen || activeDrag.studentName || '?'}
                  size="small"
                  color="primary"
                  sx={{ boxShadow: 4, cursor: 'grabbing' }}
                />
              )}
            </DragOverlay>
          </DndContext>
        </>
      )}
    </Box>
  );
}
